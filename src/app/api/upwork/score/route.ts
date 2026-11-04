// POST /api/upwork/score
// Body: { jobText: string }
// Auth: session cookie OR `Authorization: Bearer <extension-token>`
// Returns: parsed JSON scoring object from Claude.
//
// Admin-only (only Cory uses this feature for now).

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { authenticateExtension } from "@/lib/extension-auth";
import { getProfile } from "@/lib/db";
import { getAnthropic, UPWORK_SCORE_SYSTEM, buildUpworkScorePrompt } from "@/lib/anthropic";
import { DEFAULT_UPWORK_FILTERS } from "@/lib/types";
import { activeAssessmentsContext } from "@/lib/assessments";
import { hasTier } from "@/lib/users";
import { recordUsage } from "@/lib/quotas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  jobText: z.string().min(40).max(20_000),
  pageUrl: z.string().url().optional(),
});

// Allow the extension to reach us. Permissive because the user owns both
// the extension and JobScout — there is no third-party origin to defend
// against. Adjust if you ever publish the extension to other users.
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
      help: "Upwork scoring is a Pro feature ($19/mo).",
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
  const filters = profile.upwork_filters ?? DEFAULT_UPWORK_FILTERS;

  // Cheap pre-filter: skip without a Claude call when category is clearly off-target.
  // - exclude_keywords: any match → skip
  // - include_keywords (non-empty): zero matches → skip
  // Saves ~$0.001/skip on Haiku and avoids polluting reasons with off-topic jobs.
  const lc = body.jobText.toLowerCase();
  const excludeHit = (filters.exclude_keywords ?? []).find((k) => k && lc.includes(k.toLowerCase()));
  if (excludeHit) {
    return NextResponse.json({
      ok: true,
      score: {
        verdict: "skip", score: 0, reasons: [],
        filter_violations: [`exclude_keyword: "${excludeHit}"`],
        is_hourly: null, hourly_rate_low: null, hourly_rate_high: null,
        fixed_budget: null, proposals_already: null,
      },
      pageUrl: body.pageUrl ?? null,
      prefiltered: true,
    }, { headers: CORS });
  }
  const include = filters.include_keywords ?? [];
  if (include.length > 0 && !include.some((k) => k && lc.includes(k.toLowerCase()))) {
    return NextResponse.json({
      ok: true,
      score: {
        verdict: "skip", score: 0, reasons: [],
        filter_violations: ["off_topic: JD doesn't mention any of your target keywords"],
        is_hourly: null, hourly_rate_low: null, hourly_rate_high: null,
        fixed_budget: null, proposals_already: null,
      },
      pageUrl: body.pageUrl ?? null,
      prefiltered: true,
    }, { headers: CORS });
  }

  const assessments = await activeAssessmentsContext(user.uid);
  const prompt = buildUpworkScorePrompt(baseResume, body.jobText, filters, {
    career_story: profile.career_story_md ?? null,
    avoid: profile.avoid_md ?? null,
    growth_goals: profile.growth_goals_md ?? null,
    assessments,
    tuning_prompt: profile.tuning_prompt_md ?? null,
    level_up_targets: profile.level_up_targets ?? null,
    stay_with_targets: profile.stay_with_targets ?? null,
  });

  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",  // cheap fit-checker
    // Dimensional scoring (7 dimensions + notes + reasons + filter_violations
    // + bid metadata) often exceeded the old 800 cap and truncated mid-JSON.
    // 1500 leaves comfortable headroom.
    max_tokens: 1500,
    system: UPWORK_SCORE_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = resp.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  const json = extractJson(raw);
  if (!json) {
    return NextResponse.json({ error: "score_parse_failed", raw: raw.slice(0, 400) }, { status: 502, headers: CORS });
  }
  // Soft usage counter for analytics; doesn't gate (Pro+ is unlimited).
  void recordUsage(user.record.id, "upwork_score");
  return NextResponse.json({ ok: true, score: json, pageUrl: body.pageUrl ?? null }, { headers: CORS });
}

function extractJson(text: string): unknown | null {
  // Strip code fences if Claude wraps the output
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  // Try to find the first balanced JSON object in the response
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
