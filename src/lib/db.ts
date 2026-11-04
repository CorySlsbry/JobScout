// Data access layer. Uses Firestore if GOOGLE_CLOUD_PROJECT is set, otherwise the
// in-memory seed store. Multi-tenant — every public function takes `uid` as the
// first parameter. There is no fallback to a global "me" doc.

import { getDb, COL } from "./firestore";
import { getStore, rescoreAll } from "./seed";
import { scoreJob, extractRequiredYears } from "./matching";
import type {
  Application,
  ApplicationStatus,
  Job,
  JobWithApplication,
  Profile,
  PushSubscriptionJSON,
  RawJob,
} from "./types";

export type FeedFilter = {
  q?: string;
  remoteOnly?: boolean;
  stGeorgeOnly?: boolean;
  minScore?: number;
  source?: string;
  status?: ApplicationStatus | "all" | "unapplied";
};

// Compose the per-user Application doc id. Two users can save the same shared
// job without colliding because the uid prefix scopes the key.
function applicationDocId(uid: string, jobId: string): string {
  return `${uid}__${jobId}`;
}

// ─────────────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────────────
// A genuinely EMPTY profile for a brand-new signup. Critically, this does NOT
// spread getStore().profile — that's the founder's seed (name, $150k floor,
// St George locations, 30+ banned companies, resume, keywords) and spreading
// it leaked all of that into every new user. New users start clean and set
// everything up via /onboarding + /settings.
//
// The admin's own profile already exists at profile/{uid} (migrated from
// profile/me), so this seed path only ever runs for fresh signups.
function blankProfile(uid: string): Profile {
  const now = new Date().toISOString();
  return {
    id: uid,
    user_id: uid,
    full_name: "",
    email: "",
    phone: null,
    resume_md: null,
    resume_keywords: [],
    salary_floor: 0,               // 0 = no floor until the user sets one
    remote_pref: "remote_first",
    target_locations: [],
    excluded_keywords: [],
    excluded_companies: [],
    push_subscription: null,
    digest_frequency: "daily",
    digest_min_score: 70,
    digest_last_sent_at: null,
    digest_unsubscribe_token: null,
    created_at: now,
    updated_at: now,
  };
}

export async function getProfile(uid: string): Promise<Profile> {
  const db = getDb();
  if (db) {
    const snap = await db.collection(COL.profile).doc(uid).get();
    if (snap.exists) return snap.data() as Profile;
    // First boot for this user — seed a genuinely BLANK profile (no founder data).
    const seeded = blankProfile(uid);
    await db.collection(COL.profile).doc(uid).set(seeded);
    return seeded;
  }
  return getStore().profile;
}

export async function updateProfile(uid: string, patch: Partial<Profile>): Promise<Profile> {
  const db = getDb();
  if (db) {
    const ref = db.collection(COL.profile).doc(uid);
    const now = new Date().toISOString();
    const current = (await ref.get()).data() as Profile | undefined;
    const next: Profile = {
      ...(current ?? blankProfile(uid)),
      ...patch,
      user_id: uid,
      updated_at: now,
    };
    await ref.set(next);
    return next;
  }
  const store = getStore();
  store.profile = { ...store.profile, ...patch, updated_at: new Date().toISOString() };
  rescoreAll();
  return store.profile;
}

export async function savePushSubscription(uid: string, sub: PushSubscriptionJSON | null): Promise<void> {
  await updateProfile(uid, { push_subscription: sub });
}

// ─────────────────────────────────────────────────────────────────────
// Jobs
// ─────────────────────────────────────────────────────────────────────
export async function listJobs(uid: string, filter: FeedFilter = {}): Promise<JobWithApplication[]> {
  const db = getDb();
  let jobs: Job[] = [];
  let apps: Application[] = [];
  // Load the user's profile so we can apply their personal feed preferences
  // (hidden jobs, enabled sources, keyword include, experience cap, URL blacklist,
  // target titles). Applied in memory to keep Firestore queries simple.
  const profile = await getProfile(uid).catch(() => null);

  if (db) {
    // Jobs are a shared pool (global) — every user sees the same docs.
    // Single-field orderBy avoids composite-index requirement.
    // limit(200) chosen so per-user re-scoring stays under ~250ms total.
    // The top-200 by stored (admin-driven) score is a strong-enough cohort
    // for per-user re-ranking; tail below that almost never reaches the
    // active part of any user's feed.
    const jobsSnap = await db
      .collection(COL.jobs)
      .orderBy("match_score", "desc")
      .limit(200)
      .get();
    jobs = jobsSnap.docs.map((d) => d.data() as Job).filter((j) => !j.is_excluded);

    // Applications are per-user — scope by user_id.
    const appsSnap = await db
      .collection(COL.applications)
      .where("user_id", "==", uid)
      .get();
    apps = appsSnap.docs.map((d) => d.data() as Application);
  } else {
    const store = getStore();
    jobs = [...store.jobs].filter((j) => !j.is_excluded);
    apps = [...store.applications].filter((a) => a.user_id === uid);
  }

  // ── Per-user re-scoring ────────────────────────────────────────────
  // The stored match_score on each Job is computed by the cron against the
  // admin's profile (since the cron has no logged-in user). Re-score each
  // job against THIS user's profile so the feed reflects their actual fit,
  // not Cory's. Pure JS, no network — fine at 500 jobs/request.
  if (profile) {
    jobs = jobs.map((j) => {
      try {
        const m = scoreJob(j, profile);
        return {
          ...j,
          match_score: m.score,
          match_reasons: m.reasons,
          is_excluded: m.isExcluded,
        };
      } catch {
        // Defensive — keep the stored score if scoring throws.
        return j;
      }
    }).filter((j) => !j.is_excluded);
  }

  // ── Per-user feed preferences ──────────────────────────────────────
  if (profile) {
    const hiddenSet = new Set(profile.hidden_job_ids ?? []);
    if (hiddenSet.size) jobs = jobs.filter((j) => !hiddenSet.has(j.id));

    const enabledSources = profile.enabled_sources;
    if (enabledSources && enabledSources.length > 0) {
      const allow = new Set(enabledSources);
      jobs = jobs.filter((j) => allow.has(j.source));
    }

    const maxYears = profile.max_required_years;
    if (typeof maxYears === "number" && Number.isFinite(maxYears)) {
      jobs = jobs.filter((j) => j.required_years == null || j.required_years <= maxYears);
    }

    const blacklist = (profile.blacklist_url_patterns ?? []).map((p) => p.toLowerCase().trim()).filter(Boolean);
    if (blacklist.length) {
      jobs = jobs.filter((j) => {
        const url = (j.source_url ?? "").toLowerCase();
        return !blacklist.some((pat) => url.includes(pat));
      });
    }

    const includeKw = (profile.keyword_include ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean);
    if (includeKw.length) {
      jobs = jobs.filter((j) => {
        const haystack = `${j.title} ${j.company ?? ""} ${j.description ?? ""}`.toLowerCase();
        return includeKw.some((kw) => haystack.includes(kw));
      });
    }

    const targets = (profile.target_titles ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean);
    if (targets.length) {
      jobs = jobs.filter((j) => {
        const t = j.title.toLowerCase();
        return targets.some((tt) => t.includes(tt));
      });
    }
  }

  const appByJob = new Map(apps.map((a) => [a.job_id, a]));
  let merged: JobWithApplication[] = jobs.map((j) => ({
    ...j,
    application: appByJob.get(j.id) ?? null,
  }));

  if (filter.q) {
    const q = filter.q.toLowerCase();
    merged = merged.filter((j) =>
      [j.title, j.company, j.location, j.description].some((s) => (s ?? "").toLowerCase().includes(q))
    );
  }
  if (filter.remoteOnly) merged = merged.filter((j) => j.is_remote || j.remote_kind === "remote");
  if (filter.stGeorgeOnly) {
    merged = merged.filter((j) => (j.location ?? "").toLowerCase().includes("george"));
  }
  if (filter.minScore != null) merged = merged.filter((j) => (j.match_score ?? 0) >= filter.minScore!);
  if (filter.source && filter.source !== "all") merged = merged.filter((j) => j.source === filter.source);

  if (filter.status && filter.status !== "all") {
    if (filter.status === "unapplied") {
      merged = merged.filter((j) => !j.application);
    } else {
      merged = merged.filter((j) => j.application?.status === filter.status);
    }
  }

  merged.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
  return merged;
}

export async function getJob(uid: string, id: string): Promise<JobWithApplication | null> {
  const db = getDb();
  if (db) {
    const [jobSnap, appSnap] = await Promise.all([
      db.collection(COL.jobs).doc(id).get(),
      db.collection(COL.applications).doc(applicationDocId(uid, id)).get(),
    ]);
    if (!jobSnap.exists) return null;
    const job = jobSnap.data() as Job;
    const app = appSnap.exists ? (appSnap.data() as Application) : null;
    return { ...job, application: app };
  }
  const all = await listJobs(uid);
  return all.find((j) => j.id === id) ?? null;
}

export async function upsertRawJobs(
  profile: Profile,
  raws: RawJob[]
): Promise<{ inserted: number; updated: number }> {
  const db = getDb();
  let inserted = 0;
  let updated = 0;

  if (db) {
    for (const raw of raws) {
      const m = scoreJob(raw, profile);
      const docId = `${raw.source}__${raw.source_id}`;
      const ref = db.collection(COL.jobs).doc(docId);
      const existing = await ref.get();
      const payload: Job = {
        ...raw,
        id: docId,
        discovered_at: existing.exists ? (existing.data() as Job).discovered_at : new Date().toISOString(),
        match_score: m.score,
        match_reasons: m.reasons,
        is_excluded: m.isExcluded,
        required_years: extractRequiredYears(raw.description),
      };
      await ref.set(payload);
      if (existing.exists) updated++;
      else inserted++;
    }
    return { inserted, updated };
  }

  // In-memory path.
  const store = getStore();
  for (const raw of raws) {
    const m = scoreJob(raw, profile);
    const idx = store.jobs.findIndex((j) => j.source === raw.source && j.source_id === raw.source_id);
    if (idx >= 0) {
      store.jobs[idx] = {
        ...store.jobs[idx],
        ...raw,
        match_score: m.score,
        match_reasons: m.reasons,
        is_excluded: m.isExcluded,
        required_years: extractRequiredYears(raw.description),
      };
      updated++;
    } else {
      store.jobs.unshift({
        ...raw,
        id: `${raw.source}__${raw.source_id}`,
        discovered_at: new Date().toISOString(),
        match_score: m.score,
        match_reasons: m.reasons,
        is_excluded: m.isExcluded,
        required_years: extractRequiredYears(raw.description),
      });
      inserted++;
    }
  }
  return { inserted, updated };
}

// ─────────────────────────────────────────────────────────────────────
// Applications
// ─────────────────────────────────────────────────────────────────────
export async function setApplicationStatus(
  uid: string,
  jobId: string,
  status: ApplicationStatus,
  patch: Partial<Application> = {}
): Promise<Application> {
  const db = getDb();
  const now = new Date().toISOString();
  const docId = applicationDocId(uid, jobId);

  if (db) {
    const ref = db.collection(COL.applications).doc(docId);
    const existing = (await ref.get()).data() as Application | undefined;
    const next: Application = {
      id: docId,
      user_id: uid,
      job_id: jobId,
      status,
      applied_at: status === "applied" ? (existing?.applied_at ?? now) : (existing?.applied_at ?? null),
      resume_used: patch.resume_used ?? existing?.resume_used ?? null,
      cover_letter: patch.cover_letter ?? existing?.cover_letter ?? null,
      notes: patch.notes ?? existing?.notes ?? null,
      next_action_at: patch.next_action_at ?? existing?.next_action_at ?? null,
      // Auto-Pilot artifacts — thread through so the autopilot cron can stage
      // prepared resume + cover letter without a second write.
      auto_prepared: patch.auto_prepared ?? existing?.auto_prepared ?? false,
      prepared_resume_md: patch.prepared_resume_md ?? existing?.prepared_resume_md ?? null,
      prepared_cover_letter: patch.prepared_cover_letter ?? existing?.prepared_cover_letter ?? null,
      prepared_at: patch.prepared_at ?? existing?.prepared_at ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    await ref.set(next);
    return next;
  }

  const store = getStore();
  const idx = store.applications.findIndex((a) => a.user_id === uid && a.job_id === jobId);
  if (idx >= 0) {
    store.applications[idx] = {
      ...store.applications[idx],
      status,
      applied_at: status === "applied" ? (store.applications[idx].applied_at ?? now) : store.applications[idx].applied_at,
      ...patch,
      user_id: uid,
      updated_at: now,
    };
    return store.applications[idx];
  }
  const created: Application = {
    id: docId,
    user_id: uid,
    job_id: jobId,
    status,
    applied_at: status === "applied" ? now : null,
    resume_used: patch.resume_used ?? null,
    cover_letter: patch.cover_letter ?? null,
    notes: patch.notes ?? null,
    next_action_at: patch.next_action_at ?? null,
    created_at: now,
    updated_at: now,
  };
  store.applications.push(created);
  return created;
}

// ─────────────────────────────────────────────────────────────────────
// Stats (used by dashboard)
// ─────────────────────────────────────────────────────────────────────
// Accepts an OPTIONAL pre-loaded jobs array so callers (like /feed) that
// already called listJobs() don't pay for a second 500-doc Firestore read
// + 500x scoreJob() pass. /dashboard still calls without — it computes from
// the same pool but is a different page render so we don't share state.
export async function getStats(uid: string, preloadedJobs?: JobWithApplication[]): Promise<{
  total: number;
  remote: number;
  stGeorge: number;
  highMatch: number;
  applied: number;
  avgSalaryMax: number;
  bySource: Record<string, number>;
}> {
  const jobs = preloadedJobs ?? await listJobs(uid);
  const total = jobs.length;
  const remote = jobs.filter((j) => j.is_remote).length;
  const stGeorge = jobs.filter((j) => (j.location ?? "").toLowerCase().includes("george")).length;
  const highMatch = jobs.filter((j) => (j.match_score ?? 0) >= 70).length;
  const applied = jobs.filter((j) => j.application?.status === "applied").length;
  const salaries = jobs.map((j) => j.salary_max).filter((x): x is number => !!x);
  const avgSalaryMax = salaries.length ? Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length) : 0;
  const bySource = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.source] = (acc[j.source] ?? 0) + 1;
    return acc;
  }, {});
  return { total, remote, stGeorge, highMatch, applied, avgSalaryMax, bySource };
}
