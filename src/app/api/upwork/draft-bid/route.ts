// POST /api/upwork/draft-bid
// Body: { jobText: string, preferredBid?: { hourly?: number; fixed?: number }, pageUrl?: string }
// Auth: session cookie OR `Authorization: Bearer <extension-token>`
// Returns: { proposal, suggested_bid, suggested_bid_kind, first_question }
//
// Admin-only. Uses Claude Sonnet — bid quality matters more than cost here.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { authenticateExtension } from "@/lib/extension-auth";
import { getProfile } from "@/lib/db";
import { getAnthropic, UPWORK_BID_SYSTEM, buildUpworkBidPrompt } from "@/lib/anthropic";
import { activeAssessmentsContext } from "@/lib/assessments";
import { hasTier } from "@/lib/users";
import { recordUsage } from "@/lib/quotas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  jobText: z.string().min(40).max(20_000),
  preferredBid: z
    .object({
      hourly: z.number().positive().optional(),
      fixed: z.number().positive().optional(),
    })
    .optional(),
  pageUrl: z.string().url().optional(),
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const user = (await getSessionUser()) ?? (await authenticateExtension(req));
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  if (!user.record || !hasTier(user.record, "pro")) {
    return NextResponse.json({
      error: "tier_required",
      help: "Upwork proposal drafting is a Pro feature ($19/mo).",
      required_tier: "pro",
      current_tier: user.record?.plan ?? "free",
    }, { status: 402, headers: CORS });
  }

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: CORS }); }

  const client = getAnthropic();
  if (!client) return NextResponse.json({ error: "anthropic_not_configured" }, { status: 503, headers: CORS });

  const profile = await getProfile(user.uid);
  const baseResume = profile.resume_md?.trim();
  if (!baseResume) {
    return NextResponse.json({ error: "no_base_resume", help: "Save a base resume in /settings first." }, { status: 422, headers: CORS });
  }

  const assessments = await activeAssessmentsContext(user.uid);
  const prompt = buildUpworkBidPrompt(baseResume, body.jobText, body.preferredBid ?? null, {
    career_story: profile.career_story_md ?? null,
    growth_goals: profile.growth_goals_md ?? null,
    assessments,
    tuning_prompt: profile.tuning_prompt_md ?? null,
    level_up_targets: profile.level_up_targets ?? null,
    stay_with_targets: profile.stay_with_targets ?? null,
  });

  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: UPWORK_BID_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = resp.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  const json = extractJson(raw);
  if (!json) {
    return NextResponse.json({ error: "bid_parse_failed", raw: raw.slice(0, 400) }, { status: 502, headers: CORS });
  }
  void recordUsage(user.record.id, "upwork_draft_bid");
  return NextResponse.json({ ok: true, bid: json, pageUrl: body.pageUrl ?? null }, { headers: CORS });
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
