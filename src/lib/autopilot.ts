// Auto-Pilot prep engine.
//
// For each Auto-Pilot-enabled user, finds new high-match jobs (score >= the
// user's threshold) that don't already have a prepared application, and
// auto-generates a tailored resume + cover letter via Claude. The result is
// staged as an Application with status='queued' + auto_prepared=true, which
// the /autopilot page surfaces as "ready to apply."
//
// We intentionally DO NOT submit to third-party job boards on the user's
// behalf — that violates board ToS and the form-submission safety boundary.
// Auto-Pilot is "auto-prepare + one-tap apply", the most automation that's
// both compliant and safe.
//
// Cost control:
//   • Per-user cap (MAX_PREP_PER_USER) so one run can't run up a huge bill.
//   • Honors the Anthropic circuit breaker — if it's open, we skip entirely.
//   • Sonnet for quality on the artifacts the user actually sends.

import { getDb, COL } from "./firestore";
import { listJobs, getProfile, setApplicationStatus } from "./db";
import {
  getAnthropic,
  TAILOR_RESUME_SYSTEM, buildTailorPrompt,
  COVER_LETTER_SYSTEM, buildCoverLetterPrompt,
} from "./anthropic";
import { activeAssessmentsContext } from "./assessments";
import { getAnthropicCircuit } from "./healers";
import { captureError } from "./error-monitoring";
import type { User, Profile, Application } from "./types";

const MODEL = "claude-sonnet-4-6";
const MAX_PREP_PER_USER = 3;        // cap per run — keeps the bill bounded
const DEFAULT_MIN_SCORE = 85;
// Cloud Run's request timeout is 60s. Each job is 2 Claude calls (~10-20s).
// We stop preparing once we're within this budget so the cron never 504s —
// the rest of a user's backlog is picked up on the next 6-hourly run.
const RUN_BUDGET_MS = 45_000;

export type AutopilotUserResult = {
  uid: string;
  prepared: number;
  skipped_existing: number;
  candidates: number;
  error: string | null;
};

/** Run one non-streaming Claude completion, return the joined text. */
async function complete(system: string, prompt: string, maxTokens: number): Promise<string> {
  const client = getAnthropic();
  if (!client) throw new Error("anthropic_key_missing");
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  }, {
    // Per-call ceiling so one slow generation can't run indefinitely + a
    // single retry to ride out transient 5xx/network blips.
    timeout: 60_000,
    maxRetries: 1,
  });
  return res.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("\n")
    .trim();
}

/** Prepare applications for a single user. Never throws — returns a result row.
 *  `deadline` is an absolute timestamp (Date.now() + budget); we stop starting
 *  new jobs once we pass it so the whole cron stays under Cloud Run's 60s cap. */
export async function runAutopilotForUser(user: User, deadline: number = Date.now() + RUN_BUDGET_MS): Promise<AutopilotUserResult> {
  const row: AutopilotUserResult = { uid: user.id, prepared: 0, skipped_existing: 0, candidates: 0, error: null };
  try {
    const profile = await getProfile(user.id);
    const baseResume = profile.resume_md?.trim();
    if (!baseResume) { row.error = "no_base_resume"; return row; }

    const minScore = profile.autopilot_min_score ?? DEFAULT_MIN_SCORE;

    // listJobs already re-scores against this user's profile + applies their
    // filters. We want unapplied, high-match jobs not yet prepared.
    const jobs = await listJobs(user.id);
    const candidates = jobs
      .filter((j) => (j.match_score ?? 0) >= minScore)
      .filter((j) => !j.application || (!j.application.auto_prepared && j.application.status !== "applied" && j.application.status !== "dismissed"))
      .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
      .slice(0, MAX_PREP_PER_USER);
    row.candidates = candidates.length;
    if (candidates.length === 0) return row;

    const assessments = await activeAssessmentsContext(user.id);
    const ctx = {
      assessments,
      tuning_prompt: profile.tuning_prompt_md ?? null,
      level_up_targets: profile.level_up_targets ?? null,
      stay_with_targets: profile.stay_with_targets ?? null,
      career_story: profile.career_story_md ?? null,
      growth_goals: profile.growth_goals_md ?? null,
    };

    for (const job of candidates) {
      if (Date.now() > deadline) break;   // out of time-budget — next run continues
      try {
        const [resume, cover] = await Promise.all([
          complete(TAILOR_RESUME_SYSTEM, buildTailorPrompt(baseResume, job.title, job.company, job.description ?? "", ctx), 3000),
          complete(COVER_LETTER_SYSTEM, buildCoverLetterPrompt(baseResume, job.title, job.company, job.description ?? "", ctx), 1500),
        ]);
        await setApplicationStatus(user.id, job.id, "queued", {
          auto_prepared: true,
          prepared_resume_md: resume,
          prepared_cover_letter: cover,
          prepared_at: new Date().toISOString(),
        } as Partial<Application>);
        row.prepared++;
      } catch (e) {
        // One job failing shouldn't abort the whole user. Capture + continue.
        void captureError(e, { source: "server", path: "/api/cron/autopilot", integration: "anthropic", user_id: user.id, context: { jobId: job.id } });
      }
    }

    await getProfileThenStampRun(user.id);
  } catch (e) {
    row.error = e instanceof Error ? e.message.slice(0, 200) : "unknown";
    void captureError(e, { source: "server", path: "/api/cron/autopilot", user_id: user.id });
  }
  return row;
}

// Small helper to stamp autopilot_last_run without pulling updateProfile into
// the import surface twice (keeps the file's deps tight).
async function getProfileThenStampRun(uid: string): Promise<void> {
  const { updateProfile } = await import("./db");
  await updateProfile(uid, { autopilot_last_run: new Date().toISOString() });
}

/** Run Auto-Pilot for every enabled Pro+ user. Honors the circuit breaker.
 *  autopilot_enabled lives on the PROFILE doc; tier eligibility on the USER
 *  doc — so we find opted-in profiles first, then verify each user's tier. */
export async function runAutopilotAll(): Promise<{ ran: boolean; results: AutopilotUserResult[]; reason?: string }> {
  const circuit = await getAnthropicCircuit();
  if (circuit.open) return { ran: false, results: [], reason: "anthropic_circuit_open" };

  const db = getDb();
  if (!db) return { ran: false, results: [], reason: "firestore_not_configured" };

  // Find profiles that opted into Auto-Pilot. Fall back to a scan if the
  // single-field index isn't present yet.
  let optedInUids: string[] = [];
  try {
    const psnap = await db.collection(COL.profile).where("autopilot_enabled", "==", true).limit(500).get();
    optedInUids = psnap.docs.map((d) => (d.data() as Profile).user_id ?? d.id);
  } catch {
    const psnap = await db.collection(COL.profile).limit(1000).get();
    optedInUids = psnap.docs.filter((d) => (d.data() as Profile).autopilot_enabled === true).map((d) => (d.data() as Profile).user_id ?? d.id);
  }
  if (optedInUids.length === 0) return { ran: true, results: [] };

  // Shared wall-clock deadline across ALL users so the whole request finishes
  // under Cloud Run's 60s cap. Users not reached this run are picked up next run.
  const deadline = Date.now() + RUN_BUDGET_MS;
  const results: AutopilotUserResult[] = [];
  for (const uid of optedInUids) {
    if (Date.now() > deadline) break;
    // Verify the user still has a Pro+ tier before spending Claude budget.
    const usnap = await db.collection(COL.users).doc(uid).get();
    if (!usnap.exists) continue;
    const user = usnap.data() as User;
    const eligible = user.role === "admin"
      || ((user.subscription_status === "active" || user.subscription_status === "trialing") && (user.plan === "pro" || user.plan === "boost"));
    if (!eligible) continue;
    results.push(await runAutopilotForUser(user, deadline));
  }
  return { ran: true, results };
}

/** Count of prepared-but-not-applied applications for the /autopilot badge. */
export async function countPreparedApplications(uid: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  try {
    const snap = await db.collection(COL.applications)
      .where("user_id", "==", uid)
      .where("auto_prepared", "==", true)
      .where("status", "==", "queued")
      .limit(100).get();
    return snap.size;
  } catch {
    // Composite index may be missing — fall back to a scan.
    try {
      const snap = await db.collection(COL.applications).where("user_id", "==", uid).limit(500).get();
      return snap.docs.filter((d) => {
        const a = d.data() as Application;
        return a.auto_prepared && a.status === "queued";
      }).length;
    } catch { return 0; }
  }
}

export type PreparedApplication = Application & { job_title?: string; job_company?: string | null; job_url?: string; match_score?: number | null };

/** Fetch the prepared queue for /autopilot — joins each Application to its Job. */
export async function listPreparedApplications(uid: string, profile?: Profile): Promise<PreparedApplication[]> {
  const db = getDb();
  if (!db) return [];
  let apps: Application[] = [];
  try {
    const snap = await db.collection(COL.applications).where("user_id", "==", uid).limit(500).get();
    apps = snap.docs.map((d) => d.data() as Application).filter((a) => a.auto_prepared && a.status === "queued");
  } catch {
    return [];
  }
  if (apps.length === 0) return [];

  // Join to job docs (chunked "in" query by __name__).
  const jobIds = apps.map((a) => a.job_id);
  const jobMap = new Map<string, { title: string; company: string | null; source_url: string; match_score: number | null }>();
  for (let i = 0; i < jobIds.length; i += 30) {
    const chunk = jobIds.slice(i, i + 30);
    try {
      const snap = await db.collection(COL.jobs)
        .where("__name__", "in", chunk.map((id) => db.collection(COL.jobs).doc(id)))
        .get();
      for (const d of snap.docs) {
        const j = d.data() as { title: string; company: string | null; source_url: string; match_score: number | null };
        jobMap.set(d.id, { title: j.title, company: j.company, source_url: j.source_url, match_score: j.match_score });
      }
    } catch {/* skip chunk */}
  }
  void profile;
  return apps
    .map((a) => {
      const j = jobMap.get(a.job_id);
      return { ...a, job_title: j?.title, job_company: j?.company ?? null, job_url: j?.source_url, match_score: j?.match_score ?? null };
    })
    .sort((a, b) => (b.prepared_at ?? "").localeCompare(a.prepared_at ?? ""));
}
