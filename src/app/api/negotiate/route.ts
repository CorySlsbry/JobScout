// POST /api/negotiate
// Body: { offer, role, competing_offers?, candidate_leverage? }
// Auth: session cookie (no bearer — this lives in the PWA, not the extension)
// Returns: { headline_strategy, counter_offer, talking_points, leverage_signals, watch_outs }
//
// Generates a salary-negotiation script tailored to the candidate's resume,
// career story, and the specific offer on the table. Ported from
// santifer/career-ops's negotiation feature.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getProfile } from "@/lib/db";
import { getAnthropic, NEGOTIATE_SYSTEM, buildNegotiatePrompt } from "@/lib/anthropic";
import { hasTier } from "@/lib/users";
import { recordUsage } from "@/lib/quotas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  offer: z.object({
    base: z.number().optional(),
    equity: z.string().max(500).optional(),
    signing: z.number().optional(),
    benefits: z.string().max(1000).optional(),
    location: z.string().max(200).optional(),
  }),
  role: z.object({
    title: z.string().min(1).max(200),
    company: z.string().min(1).max(200),
    level: z.string().max(100).optional(),
    geography: z.string().max(200).optional(),
    description: z.string().max(5_000).optional(),
  }),
  competing_offers: z.string().max(2_000).optional(),
  candidate_leverage: z.string().max(2_000).optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!user.record || !hasTier(user.record, "boost")) {
    return NextResponse.json({
      error: "tier_required",
      help: "Negotiation playbooks are a Boost feature ($29/mo). Upgrade in Settings → Billing.",
      required_tier: "boost",
      current_tier: user.record?.plan ?? "free",
    }, { status: 402 });
  }

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const client = getAnthropic();
  if (!client) return NextResponse.json({ error: "anthropic_not_configured" }, { status: 503 });

  const profile = await getProfile(user.uid);
  const resume = profile.resume_md?.trim();
  if (!resume) {
    return NextResponse.json({ error: "no_base_resume", help: "Save a base resume in /settings first." }, { status: 422 });
  }

  const prompt = buildNegotiatePrompt({
    resume_md: resume,
    career_story: profile.career_story_md ?? null,
    growth_goals: profile.growth_goals_md ?? null,
    offer: body.offer,
    role: body.role,
    competing_offers: body.competing_offers,
    candidate_leverage: body.candidate_leverage,
  });

  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",   // strategic reasoning — worth Sonnet
    max_tokens: 2_000,
    system: NEGOTIATE_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = resp.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  const json = extractJson(raw);
  if (!json) {
    return NextResponse.json({ error: "negotiate_parse_failed", raw: raw.slice(0, 400) }, { status: 502 });
  }
  void recordUsage(user.record.id, "negotiate");
  return NextResponse.json({ ok: true, plan: json });
}

function extractJson(text: string): unknown | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}
