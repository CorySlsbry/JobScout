// Cron endpoint — Upwork inbox watcher.
//   GET /api/cron/upwork-inbox?token=$CRON_TOKEN
//
// Pipeline: poll Gmail for Upwork job-alert emails → parse out the jobs →
// score each (Haiku) → for apply-verdict jobs, pre-draft the proposal
// (Sonnet) → store as UpworkLead → label the email processed → push-notify.
//
// The actual proposal SUBMIT is never done here — that stays a human action
// in the browser extension (Upwork ToS). This only stages everything.

import { NextResponse } from "next/server";
import webpush from "web-push";
import { getProfile, updateProfile } from "@/lib/db";
import { getAdminUid } from "@/lib/users";
import {
  refreshAccessToken, listMessages, getMessage, extractBody, getHeader,
  ensureLabel, addLabel,
} from "@/lib/gmail";
import { parseUpworkAlertEmail } from "@/lib/upwork-email";
import { existingLeadIds, upsertLead, leadIdFromJobId } from "@/lib/leads";
import { activeAssessmentsContext } from "@/lib/assessments";
import {
  getAnthropic,
  UPWORK_SCORE_SYSTEM, buildUpworkScorePrompt,
  UPWORK_BID_SYSTEM, buildUpworkBidPrompt,
} from "@/lib/anthropic";
import { DEFAULT_UPWORK_FILTERS } from "@/lib/types";
import type { UpworkLead } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const PROCESSED_LABEL = "JobScout/Processed";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_TOKEN || url.searchParams.get("token") !== process.env.CRON_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "gmail_oauth_not_configured" }, { status: 503 });
  }

  const adminUid = await getAdminUid();
  if (!adminUid) {
    return NextResponse.json({ error: "no_admin_user" }, { status: 503 });
  }

  const profile = await getProfile(adminUid);
  if (!profile.gmail_refresh_token) {
    return NextResponse.json({ error: "gmail_not_connected", help: "Connect Gmail in /settings." }, { status: 422 });
  }
  const anthropic = getAnthropic();
  if (!anthropic) return NextResponse.json({ error: "anthropic_not_configured" }, { status: 503 });

  const baseResume = profile.resume_md?.trim();
  if (!baseResume) {
    return NextResponse.json({ error: "no_base_resume", help: "Save a base resume in /settings." }, { status: 422 });
  }
  const filters = profile.upwork_filters ?? DEFAULT_UPWORK_FILTERS;
  const assessments = await activeAssessmentsContext(adminUid);
  const ctx = {
    career_story: profile.career_story_md ?? null,
    growth_goals: profile.growth_goals_md ?? null,
    avoid: profile.avoid_md ?? null,
    assessments,
    tuning_prompt: profile.tuning_prompt_md ?? null,
    level_up_targets: profile.level_up_targets ?? null,
    stay_with_targets: profile.stay_with_targets ?? null,
  };

  // 1. Auth.
  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(profile.gmail_refresh_token, clientId, clientSecret);
  } catch (e) {
    return NextResponse.json({ error: "gmail_token_refresh_failed", detail: String(e) }, { status: 502 });
  }

  // 2. Find unprocessed Upwork alert emails from the last 3 days.
  const query = `from:upwork.com newer_than:3d -label:${PROCESSED_LABEL}`;
  let messages;
  try {
    messages = await listMessages(accessToken, query, 25);
  } catch (e) {
    return NextResponse.json({ error: "gmail_list_failed", detail: String(e) }, { status: 502 });
  }

  if (messages.length === 0) {
    await updateProfile(adminUid, { upwork_inbox_last_run: new Date().toISOString() });
    return NextResponse.json({ ok: true, emails: 0, jobs: 0, leads: 0, note: "no new Upwork emails" });
  }

  const processedLabelId = await ensureLabel(accessToken, PROCESSED_LABEL).catch(() => null);

  // 3. Parse every email → collect unique jobs.
  type RawJob = { job_id: string; job_url: string; title: string; description: string; budget_text: string | null; source_email_id: string; source_search: string | null };
  const allJobs: RawJob[] = [];
  for (const m of messages) {
    try {
      const full = await getMessage(accessToken, m.id);
      const { html, text } = extractBody(full);
      // Only treat it as an alert if the subject looks like a job digest.
      const subject = getHeader(full, "Subject").toLowerCase();
      const looksLikeAlert = /job|saved search|new (?:jobs|opportunit)/.test(subject) || /\/jobs\/~0/i.test(html);
      if (!looksLikeAlert) continue;
      const parsed = parseUpworkAlertEmail(html, text);
      for (const j of parsed.jobs) {
        allJobs.push({ ...j, source_email_id: m.id, source_search: parsed.search_name });
      }
    } catch (e) {
      console.error(`[upwork-inbox] message ${m.id} failed`, e);
    }
  }

  // 4. Dedupe vs jobs we've already scored.
  const uniqueJobs = dedupe(allJobs, (j) => j.job_id);
  const leadIds = uniqueJobs.map((j) => leadIdFromJobId(j.job_id));
  const already = await existingLeadIds(adminUid, leadIds);
  const fresh = uniqueJobs.filter((j) => !already.has(leadIdFromJobId(j.job_id)));

  // 5. Score (+ pre-draft on apply). Concurrency 3 — Cloud Run + Anthropic.
  let applies = 0;
  const newLeads: UpworkLead[] = [];
  await runPool(fresh, 3, async (job) => {
    const jobText = `${job.title}\n\n${job.description}${job.budget_text ? `\n\nBudget: ${job.budget_text}` : ""}`.slice(0, 18_000);
    if (jobText.length < 60) return;

    // Cheap pre-filter (mirrors /api/upwork/score).
    const lc = jobText.toLowerCase();
    const excludeHit = (filters.exclude_keywords ?? []).find((k) => k && lc.includes(k.toLowerCase()));
    const include = filters.include_keywords ?? [];
    const offTopic = include.length > 0 && !include.some((k) => k && lc.includes(k.toLowerCase()));

    let score = makeEmptyScore();
    if (excludeHit) {
      score = { ...score, verdict: "skip", filter_violations: [`exclude_keyword: "${excludeHit}"`] };
    } else if (offTopic) {
      score = { ...score, verdict: "skip", filter_violations: ["off_topic: no include_keyword matched"] };
    } else {
      try {
        const resp = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          system: UPWORK_SCORE_SYSTEM,
          messages: [{ role: "user", content: buildUpworkScorePrompt(baseResume, jobText, filters, ctx) }],
        });
        const parsed = extractJson(resp.content.map((c) => (c.type === "text" ? c.text : "")).join(""));
        if (parsed) score = { ...makeEmptyScore(), ...(parsed as object) };
      } catch (e) {
        console.error(`[upwork-inbox] score failed for ${job.job_id}`, e);
      }
    }

    // Pre-draft the proposal when the verdict is apply.
    let draftCover: string | null = null;
    let suggestedBid: number | null = null;
    let suggestedKind: "hourly" | "fixed" | null = null;
    if (score.verdict === "apply") {
      applies++;
      try {
        const resp = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1200,
          system: UPWORK_BID_SYSTEM,
          messages: [{ role: "user", content: buildUpworkBidPrompt(baseResume, jobText, null, ctx) }],
        });
        const bid = extractJson(resp.content.map((c) => (c.type === "text" ? c.text : "")).join("")) as
          { proposal?: string; suggested_bid?: number; suggested_bid_kind?: "hourly" | "fixed" } | null;
        if (bid) {
          draftCover = bid.proposal ?? null;
          suggestedBid = bid.suggested_bid ?? null;
          suggestedKind = bid.suggested_bid_kind ?? null;
        }
      } catch (e) {
        console.error(`[upwork-inbox] draft failed for ${job.job_id}`, e);
      }
    }

    const now = new Date().toISOString();
    newLeads.push({
      id: leadIdFromJobId(job.job_id),
      user_id: adminUid,
      job_url: job.job_url,
      title: job.title,
      description: job.description,
      budget_text: job.budget_text,
      source_email_id: job.source_email_id,
      source_search: job.source_search,
      verdict: score.verdict,
      score: score.score,
      reasons: score.reasons,
      dimensions: score.dimensions,
      filter_violations: score.filter_violations,
      draft_cover_letter: draftCover,
      draft_answers: null,             // screening Qs are drafted later, on the apply page
      suggested_bid: suggestedBid,
      suggested_bid_kind: suggestedKind,
      status: "new",
      discovered_at: now,
      updated_at: now,
    });
  });

  for (const lead of newLeads) await upsertLead(lead);

  // 6. Label processed emails so we don't re-scan them.
  if (processedLabelId) {
    for (const m of messages) {
      await addLabel(accessToken, m.id, processedLabelId).catch(() => { /* non-fatal */ });
    }
  }

  // 7. Push-notify on apply-verdict leads.
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv && applies > 0 && profile.push_subscription) {
    webpush.setVapidDetails(process.env.VAPID_CONTACT_EMAIL ?? "mailto:cory.salisbury@gmail.com", pub, priv);
    const top = newLeads.filter((l) => l.verdict === "apply").sort((a, b) => b.score - a.score).slice(0, 3);
    await webpush.sendNotification(
      profile.push_subscription as unknown as webpush.PushSubscription,
      JSON.stringify({
        title: `${applies} new Upwork match${applies === 1 ? "" : "es"} — pre-drafted`,
        body: top.map((l) => `${l.score} · ${l.title}`).join("\n"),
        icon: "/icon-192.png",
        url: "/upwork-leads",
      }),
    ).catch((e) => console.error("[upwork-inbox] push failed", e));
  }

  await updateProfile(adminUid, { upwork_inbox_last_run: new Date().toISOString() });

  return NextResponse.json({
    ok: true,
    emails: messages.length,
    jobs_found: uniqueJobs.length,
    new_leads: newLeads.length,
    apply_verdicts: applies,
  });
}

// ── helpers ─────────────────────────────────────────────────────────────

type ScoreShape = {
  verdict: "apply" | "skip";
  score: number;
  reasons: string[];
  dimensions: Array<{ name: string; score: number; note: string }>;
  filter_violations: string[];
};
function makeEmptyScore(): ScoreShape {
  return { verdict: "skip", score: 0, reasons: [], dimensions: [], filter_violations: [] };
}

function dedupe<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

async function runPool<T>(items: T[], concurrency: number, fn: (t: T) => Promise<void>): Promise<void> {
  const queue = items.slice();
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    let next = queue.shift();
    while (next !== undefined) {
      await fn(next);
      next = queue.shift();
    }
  });
  await Promise.all(workers);
}

function extractJson(text: string): unknown | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
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
