"use server";

import webpush from "web-push";
import { revalidatePath } from "next/cache";
import {
  setApplicationStatus,
  upsertRawJobs,
  savePushSubscription,
  getProfile,
  updateProfile,
} from "@/lib/db";
import { runAllScrapers } from "@/lib/scrapers";
import { profileToScrapeQueries } from "@/lib/job-search-config";
import { shouldNotify } from "@/lib/matching";
import { getSessionUser } from "@/lib/auth";
import type { PushSubscriptionJSON } from "@/lib/types";

function configureWebPush(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const contact = process.env.VAPID_CONTACT_EMAIL ?? "mailto:cory.salisbury@gmail.com";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(contact, pub, priv);
  return true;
}

async function requireUid(): Promise<{ ok: true; uid: string } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  return { ok: true, uid: user.uid };
}

// ── Push subscription ────────────────────────────────────────────────
export async function subscribePush(sub: PushSubscriptionJSON) {
  const session = await requireUid();
  if (!session.ok) return { ok: false, error: session.error };
  await savePushSubscription(session.uid, sub);
  return { ok: true };
}

export async function unsubscribePush() {
  const session = await requireUid();
  if (!session.ok) return { ok: false, error: session.error };
  await savePushSubscription(session.uid, null);
  return { ok: true };
}

export async function sendTestNotification(message?: string) {
  const session = await requireUid();
  if (!session.ok) return { ok: false, error: session.error };
  if (!configureWebPush()) {
    return { ok: false, error: "VAPID keys not set. Run `npx web-push generate-vapid-keys` and add to .env.local." };
  }
  const profile = await getProfile(session.uid);
  if (!profile.push_subscription) return { ok: false, error: "No subscription saved." };
  await webpush.sendNotification(
    profile.push_subscription as unknown as webpush.PushSubscription,
    JSON.stringify({
      title: "JobScout test",
      body: message ?? "If you see this, push is working 🚀",
      icon: "/icon-192.png",
      url: "/",
    })
  );
  return { ok: true };
}

// ── Application actions (form-bound) ─────────────────────────────────
export async function applyAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const jobId = String(formData.get("job_id"));
  await setApplicationStatus(session.uid, jobId, "applied");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/saved");
  revalidatePath("/");
}

export async function saveAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const jobId = String(formData.get("job_id"));
  await setApplicationStatus(session.uid, jobId, "saved");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/saved");
  revalidatePath("/");
}

export async function dismissAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const jobId = String(formData.get("job_id"));
  await setApplicationStatus(session.uid, jobId, "dismissed");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/");
}

// ── Hard hide / restore a job from the user's feed ──────────────────
// Unlike dismiss (which keeps an Application row in 'dismissed' state and
// still shows in /feed when status='all'), hide adds job_id to
// profile.hidden_job_ids so the job is FILTERED OUT of listJobs entirely.
// Visible only on /trash with a restore button.
export async function hideJobAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const jobId = String(formData.get("job_id"));
  const profile = await getProfile(session.uid);
  const current = profile.hidden_job_ids ?? [];
  if (!current.includes(jobId)) {
    await updateProfile(session.uid, { hidden_job_ids: [...current, jobId] });
  }
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/feed");
  revalidatePath("/trash");
  revalidatePath("/saved");
}

// Save per-user Upwork RSS feed URLs. Validates each is a real http(s) URL on
// upwork.com so users can't shove arbitrary URLs into the scraper.
export async function saveUpworkSourcesAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const raw = String(formData.get("upwork_search_urls") ?? "").trim();
  const urls = raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((u) => {
      try {
        const x = new URL(u);
        return (x.protocol === "https:" || x.protocol === "http:") && x.host.toLowerCase().endsWith("upwork.com");
      } catch { return false; }
    })
    .slice(0, 20);    // cap defensively
  await updateProfile(session.uid, { upwork_search_urls: urls });
  revalidatePath("/settings");
  revalidatePath("/upwork-leads");
  revalidatePath("/upwork");
}

// Save per-user Upwork search KEYWORDS — the live ingestion mechanism since
// Upwork retired public RSS (the /ab/feed/jobs/rss endpoints now 410 Gone).
// Each keyword phrase is one Upwork search the cron runs through the Apify
// scraper. One phrase per line or comma; multi-word phrases (spaces) preserved.
export async function saveUpworkSearchQueriesAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const raw = String(formData.get("upwork_search_queries") ?? "").trim();
  const queries = raw
    .split(/[\n,]+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 2 && s.length <= 100)
    .slice(0, 8);    // cost guard — cron scrapes the first 4, this leaves headroom
  await updateProfile(session.uid, { upwork_search_queries: Array.from(new Set(queries)) });
  revalidatePath("/settings");
  revalidatePath("/upwork-leads");
  revalidatePath("/upwork");
}

export async function restoreJobAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const jobId = String(formData.get("job_id"));
  const profile = await getProfile(session.uid);
  const current = profile.hidden_job_ids ?? [];
  if (current.includes(jobId)) {
    await updateProfile(session.uid, { hidden_job_ids: current.filter((x) => x !== jobId) });
  }
  revalidatePath("/feed");
  revalidatePath("/trash");
}

// ── Job-pull control ────────────────────────────────────────────────
// Saves the search terms + locations that DRIVE the actual scrape (what
// enters the pool), distinct from the post-pull filters in saveSearchTailoring.
export async function saveJobSearchConfigAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const parseList = (k: string, cap: number): string[] => {
    const raw = String(formData.get(k) ?? "").trim();
    if (!raw) return [];
    const seen = new Set<string>();
    return raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).filter((s) => {
      const lk = s.toLowerCase();
      if (seen.has(lk)) return false;
      seen.add(lk);
      return true;
    }).slice(0, cap);
  };
  await updateProfile(session.uid, {
    search_queries:     parseList("search_queries", 8),
    search_locations:   parseList("search_locations", 6),
    search_remote_only: formData.get("search_remote_only") === "on",
  });
  revalidatePath("/settings");
  revalidatePath("/feed");
}

// On-demand: run THIS user's search config immediately (don't wait for the
// 2-hourly cron). Reuses syncJobsAction's per-user pull.
export async function syncMySearchesAction() {
  return syncJobsAction();
}

// ── Auto-Pilot ──────────────────────────────────────────────────────
export async function saveAutoPilotAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const enabled = formData.get("autopilot_enabled") === "on";
  const rawScore = Number(formData.get("autopilot_min_score"));
  const minScore = Number.isFinite(rawScore) ? Math.min(100, Math.max(50, rawScore)) : 85;
  await updateProfile(session.uid, {
    autopilot_enabled: enabled,
    autopilot_min_score: minScore,
  });
  revalidatePath("/settings");
  revalidatePath("/autopilot");
}

// ── Search tailoring (per-user feed shaping) ────────────────────────
// Drives the listJobs filter chain: hidden_job_ids, enabled_sources,
// max_required_years, blacklist_url_patterns, keyword_include, target_titles,
// plus the YoE + webhook + quiet-hours profile fields.
export async function saveSearchTailoringAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);

  const parseList = (k: string): string[] => {
    const raw = String(formData.get(k) ?? "").trim();
    if (!raw) return [];
    const items = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set<string>();
    return items.filter((s) => {
      const lk = s.toLowerCase();
      if (seen.has(lk)) return false;
      seen.add(lk);
      return true;
    });
  };
  const parseNum = (k: string): number | null => {
    const raw = String(formData.get(k) ?? "").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const parseUrl = (k: string): string | null => {
    const raw = String(formData.get(k) ?? "").trim();
    if (!raw) return null;
    try { new URL(raw); return raw; } catch { return null; }
  };

  // Sources: checkboxes serialize as "on" per name. The Profile.JobSource list
  // is in lib/types.ts; we accept whatever the form sends and intersect server-side.
  const VALID_SOURCES = ['linkedin','indeed','ziprecruiter','ksl','jsearch','google_jobs','greenhouse','ashby','lever','other'] as const;
  const enabledSources = VALID_SOURCES.filter((s) => formData.get(`src_${s}`) === "on");

  // Custom sources: serialized as "kind|slug" pairs separated by newlines/commas.
  // e.g. "greenhouse|anthropic", "ashby|vellum-ai", "lever|stripe".
  const parseCustomSources = (): Array<{ kind: 'greenhouse' | 'ashby' | 'lever'; slug: string }> => {
    const raw = String(formData.get("custom_sources") ?? "").trim();
    if (!raw) return [];
    const lines = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const out: Array<{ kind: 'greenhouse' | 'ashby' | 'lever'; slug: string }> = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const parts = line.split("|").map((s) => s.trim().toLowerCase());
      if (parts.length !== 2) continue;
      const [kind, slug] = parts;
      if (!slug || slug.length > 80 || !/^[a-z0-9._-]+$/.test(slug)) continue;
      if (kind !== "greenhouse" && kind !== "ashby" && kind !== "lever") continue;
      const k = `${kind}::${slug}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ kind, slug });
    }
    return out.slice(0, 50);   // hard cap per user
  };

  await updateProfile(session.uid, {
    target_titles:           parseList("target_titles"),
    keyword_include:         parseList("keyword_include"),
    blacklist_url_patterns:  parseList("blacklist_url_patterns"),
    enabled_sources:         enabledSources.length === VALID_SOURCES.length ? [] : enabledSources, // empty = all
    years_experience:        parseNum("years_experience"),
    max_required_years:      parseNum("max_required_years"),
    slack_webhook_url:       parseUrl("slack_webhook_url"),
    discord_webhook_url:     parseUrl("discord_webhook_url"),
    quiet_hours_start:       parseNum("quiet_hours_start"),
    quiet_hours_end:         parseNum("quiet_hours_end"),
    custom_sources:          parseCustomSources(),
  });
  revalidatePath("/settings");
  revalidatePath("/feed");
  revalidatePath("/trash");
}

// ── Sync (run all scrapers + notify) ─────────────────────────────────
// On-demand sync runs THIS user's own search config (so they get instant
// results after configuring queries/locations), plus their custom portal
// sources. Falls back to platform defaults when they haven't configured any.
export async function syncJobsAction() {
  const session = await requireUid();
  if (!session.ok) return { ok: false, error: session.error };
  const profile = await getProfile(session.uid);

  const myQueries = profileToScrapeQueries(profile);
  const myPortals = (profile.custom_sources ?? [])
    .filter((s) => s && (s.kind === "greenhouse" || s.kind === "ashby" || s.kind === "lever") && s.slug)
    .map((s) => ({ kind: s.kind, slug: s.slug.trim().toLowerCase() }));
  const raws = await runAllScrapers(myPortals, myQueries);
  const { inserted, updated } = await upsertRawJobs(profile, raws);

  // Notify on new high-match results.
  if (configureWebPush()) {
    if (profile.push_subscription) {
      const notable = raws.filter((r) => {
        const isStGeorge = (r.location ?? "").toLowerCase().includes("george");
        const annual = r.salary_period === "year" ? r.salary_max ?? r.salary_min ?? 0 :
                       r.salary_period === "month" ? (r.salary_max ?? r.salary_min ?? 0) * 12 :
                       (r.salary_max ?? r.salary_min ?? 0) * 2080;
        return shouldNotify(60, annual >= profile.salary_floor, isStGeorge);
      });
      if (notable.length) {
        await webpush.sendNotification(
          profile.push_subscription as unknown as webpush.PushSubscription,
          JSON.stringify({
            title: `${notable.length} new high-match job${notable.length === 1 ? "" : "s"}`,
            body: notable.slice(0, 2).map((j) => `${j.title} — ${j.company ?? "?"}`).join("\n"),
            icon: "/icon-192.png",
            url: "/",
          })
        );
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/saved");
  revalidatePath("/dashboard");
  return { ok: true, inserted, updated, scanned: raws.length };
}

// ── Settings ─────────────────────────────────────────────────────────
export async function saveSettingsAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const salaryFloor = Number(formData.get("salary_floor")) || 150000;
  const remotePref = String(formData.get("remote_pref") ?? "remote_first") as
    | "remote_only"
    | "remote_first"
    | "hybrid_ok"
    | "onsite_ok";
  const keywords = String(formData.get("resume_keywords") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const excluded = String(formData.get("excluded_keywords") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const excludedCompanies = String(formData.get("excluded_companies") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await updateProfile(session.uid, {
    salary_floor: salaryFloor,
    remote_pref: remotePref,
    resume_keywords: keywords.length ? keywords : undefined,
    excluded_keywords: excluded.length ? excluded : undefined,
    excluded_companies: excludedCompanies,
  });
  revalidatePath("/settings");
  revalidatePath("/");
}

// Live calibration controls — tuning prompt + Level Up + Stay With chips.
// Every scorer and drafter prompt reads these on the next request.
export async function saveCalibrationAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const tuning = String(formData.get("tuning_prompt_md") ?? "").trim();
  const parseList = (k: string): string[] => {
    const raw = String(formData.get(k) ?? "").trim();
    if (!raw) return [];
    // Accept either newline- or comma-separated input. Trim, drop empties,
    // dedupe (case-insensitive) so the UI's chip-list survives a round-trip.
    const items = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set<string>();
    return items.filter((s) => {
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  await updateProfile(session.uid, {
    tuning_prompt_md: tuning.length ? tuning : null,
    level_up_targets: parseList("level_up_targets"),
    stay_with_targets: parseList("stay_with_targets"),
  });
  revalidatePath("/settings");
}

// Saves the richer profile context the AI scorer reads alongside the resume.
// career_story / avoid / growth_goals shape every Upwork score + every bid draft.
export async function saveCareerContextAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v.length ? v : null;
  };
  await updateProfile(session.uid, {
    career_story_md: str("career_story_md"),
    avoid_md: str("avoid_md"),
    growth_goals_md: str("growth_goals_md"),
  });
  revalidatePath("/settings");
}

// Saves the markdown base resume that the AI tailor button uses as its source.
export async function saveResumeAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const md = String(formData.get("resume_md") ?? "").trim();
  await updateProfile(session.uid, { resume_md: md || null });
  revalidatePath("/settings");
}

// Removes a company from the banned list — the next sync may surface jobs
// from them again. Doesn't re-score existing Firestore jobs (they'll naturally
// re-flow on the next cron, OR the user can hit Sync now from /settings).
export async function unbanCompanyAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const company = String(formData.get("company") ?? "").trim();
  if (!company) return;

  const profile = await getProfile(session.uid);
  const current = profile.excluded_companies ?? [];
  const next = current.filter((c) => c.toLowerCase() !== company.toLowerCase());
  if (next.length !== current.length) {
    await updateProfile(session.uid, { excluded_companies: next });
  }

  revalidatePath("/settings");
  revalidatePath("/feed");
}

// Bans a job's employer — adds to profile.excluded_companies AND immediately
// flips is_excluded=true on every existing job from that company so they
// drop out of the feed without waiting for the next cron sync.
export async function banCompanyAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const company = String(formData.get("company") ?? "").trim();
  if (!company) return;

  const profile = await getProfile(session.uid);
  const current = profile.excluded_companies ?? [];
  const lc = company.toLowerCase();
  if (!current.some((c) => c.toLowerCase() === lc)) {
    await updateProfile(session.uid, { excluded_companies: [...current, company] });
  }

  // Re-score the affected jobs server-side. We use the in-memory listJobs
  // for the candidate set, then upsertRawJobs to re-flag is_excluded with
  // the now-updated profile. Cheap; touches only matching docs.
  const db = await import("@/lib/db");
  const refreshedProfile = await db.getProfile(session.uid);
  const all = await db.listJobs(session.uid);
  const matching = all.filter((j) => (j.company ?? "").toLowerCase() === lc);
  if (matching.length) {
    await db.upsertRawJobs(refreshedProfile, matching.map((j) => ({
      source: j.source,
      source_id: j.source_id,
      source_url: j.source_url,
      title: j.title,
      company: j.company,
      company_url: j.company_url,
      location: j.location,
      is_remote: j.is_remote,
      remote_kind: j.remote_kind,
      salary_min: j.salary_min,
      salary_max: j.salary_max,
      salary_period: j.salary_period,
      description: j.description,
      description_html: j.description_html,
      posted_at: j.posted_at,
      raw: j.raw,
    })));
  }

  revalidatePath("/feed");
  revalidatePath("/dashboard");
  revalidatePath("/saved");
  revalidatePath("/settings");
}

// Marks an Upwork lead viewed / applied / dismissed.
export async function setUpworkLeadStatusAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const id = String(formData.get("lead_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!id || !["new", "viewed", "applied", "dismissed"].includes(status)) return;
  const { setLeadStatus } = await import("@/lib/leads");
  await setLeadStatus(session.uid, id, status as "new" | "viewed" | "applied" | "dismissed");
  revalidatePath("/upwork-leads");
}

// Saves Upwork filter toggles (admin-only feature).
export async function saveUpworkFiltersAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const { DEFAULT_UPWORK_FILTERS } = await import("@/lib/types");
  const bool = (k: string) => formData.get(k) === "on";
  const num = (k: string, fallback: number) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  };
  const keywords = String(formData.get("exclude_keywords") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const includeKeywords = String(formData.get("include_keywords") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await updateProfile(session.uid, {
    upwork_filters: {
      hourly_only:           bool("hourly_only"),
      no_time_tracker:       bool("no_time_tracker"),
      no_fixed_schedule:     bool("no_fixed_schedule"),
      no_onsite:             bool("no_onsite"),
      no_long_term:          bool("no_long_term"),
      min_hourly_rate:       num("min_hourly_rate", DEFAULT_UPWORK_FILTERS.min_hourly_rate),
      min_fixed_budget:      num("min_fixed_budget", DEFAULT_UPWORK_FILTERS.min_fixed_budget),
      max_proposals_already: num("max_proposals_already", DEFAULT_UPWORK_FILTERS.max_proposals_already),
      exclude_keywords:      keywords.length ? keywords : DEFAULT_UPWORK_FILTERS.exclude_keywords,
      include_keywords:      includeKeywords, // empty array = no positive filter (user opted out)
    },
  });
  revalidatePath("/settings");
}

// Saves email-digest preferences (frequency + min match score).
export async function saveDigestAction(formData: FormData) {
  const session = await requireUid();
  if (!session.ok) throw new Error(session.error);
  const freq = String(formData.get("digest_frequency") ?? "daily") as "off" | "daily" | "weekly";
  const minScore = Math.max(0, Math.min(100, Number(formData.get("digest_min_score") ?? 70)));
  await updateProfile(session.uid, { digest_frequency: freq, digest_min_score: minScore });
  revalidatePath("/settings");
}
