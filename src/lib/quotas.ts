// Per-user usage counters + free-tier quota enforcement.
//
// Free tier limits (per the launch plan):
//   - jobs_scored:  5 / day
//   - tailors:      3 / month
//   - cover_letters: 2 / month
//   - upwork_score: 0 (Pro+)
//   - upwork_draft_bid: 0 (Pro+)
//   - upwork_draft_application: 0 (Pro+)
//   - upwork_inbox_emails: 0 (Pro+)
//   - assessments_extract: 0 (Pro+)
//   - comp_lookups: 0 (Boost only)
//   - negotiate: 0 (Boost only)
//
// Pro: everything but the Boost-only lanes is unlimited.
// Boost: everything is unlimited.
//
// Counters are stored at usage_counters/{uid}__{yyyy-mm-dd or yyyy-mm}_{metric}.
// Daily metrics roll on the user's wall-clock day in UTC; monthly metrics roll
// on the calendar month. This is a soft enforcement layer — Stripe webhook is
// the hard tier source.

import { getDb, COL } from "./firestore";
import type { User, UserPlan } from "./types";
import { hasTier } from "./users";

export type MeteredAction =
  | "jobs_scored"
  | "tailors"
  | "cover_letters"
  | "upwork_score"
  | "upwork_draft_bid"
  | "upwork_draft_application"
  | "upwork_inbox_emails"
  | "assessments_extract"
  | "comp_lookups"
  | "negotiate";

type Window = "day" | "month";

type Spec = {
  /** Required tier to use the feature at all. Free-tier users at 'free' get the FREE_QUOTA below. */
  min_tier: UserPlan;
  /** Free-tier monthly/daily allowance — only enforced when the user is on `free`. */
  free_quota: number;
  /** Rolling-window for the free quota. */
  window: Window;
};

const SPECS: Record<MeteredAction, Spec> = {
  jobs_scored:               { min_tier: "free",  free_quota: 5,   window: "day"   },
  tailors:                   { min_tier: "free",  free_quota: 3,   window: "month" },
  cover_letters:             { min_tier: "free",  free_quota: 2,   window: "month" },
  upwork_score:              { min_tier: "pro",   free_quota: 0,   window: "month" },
  upwork_draft_bid:          { min_tier: "pro",   free_quota: 0,   window: "month" },
  upwork_draft_application:  { min_tier: "pro",   free_quota: 0,   window: "month" },
  upwork_inbox_emails:       { min_tier: "pro",   free_quota: 0,   window: "day"   },
  assessments_extract:       { min_tier: "pro",   free_quota: 0,   window: "month" },
  comp_lookups:              { min_tier: "boost", free_quota: 0,   window: "month" },
  negotiate:                 { min_tier: "boost", free_quota: 0,   window: "month" },
};

export type QuotaCheckResult =
  | { ok: true; remaining: number | "unlimited" }
  | { ok: false; reason: "tier_required"; required: UserPlan; current: UserPlan }
  | { ok: false; reason: "quota_exceeded"; metric: MeteredAction; limit: number; window: Window };

function windowKey(window: Window, date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  if (window === "month") return `${y}-${m}`;
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function counterDocId(uid: string, action: MeteredAction, window: Window): string {
  return `${uid}__${windowKey(window)}__${action}`;
}

/**
 * Read-only check that the action is allowed RIGHT NOW for the user. Does
 * not increment. Use right before invoking the expensive work; if it passes,
 * call `recordUsage` after to consume the quota.
 */
export async function checkQuota(user: User, action: MeteredAction): Promise<QuotaCheckResult> {
  const spec = SPECS[action];
  // Admins and tier holders skip the metering layer entirely.
  if (hasTier(user, spec.min_tier)) {
    return { ok: true, remaining: "unlimited" };
  }
  // Below required tier AND we have a free allowance? Check the counter.
  if (spec.free_quota > 0 && user.plan === "free") {
    const used = await readCounter(user.id, action, spec.window);
    if (used < spec.free_quota) {
      return { ok: true, remaining: spec.free_quota - used };
    }
    return { ok: false, reason: "quota_exceeded", metric: action, limit: spec.free_quota, window: spec.window };
  }
  // Locked feature.
  return { ok: false, reason: "tier_required", required: spec.min_tier, current: user.plan };
}

/** Increment the per-user counter. Call AFTER successful work, not on error. */
export async function recordUsage(uid: string, action: MeteredAction, delta = 1): Promise<void> {
  const spec = SPECS[action];
  const db = getDb();
  if (!db) return;   // local dev — no enforcement
  const id = counterDocId(uid, action, spec.window);
  const ref = db.collection(COL.usageCounters).doc(id);
  try {
    await ref.set({
      uid,
      action,
      window: spec.window,
      window_key: windowKey(spec.window),
      count: (await readCounter(uid, action, spec.window)) + delta,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Best-effort — never block real work on counter failures.
  }
}

async function readCounter(uid: string, action: MeteredAction, window: Window): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const id = counterDocId(uid, action, window);
  const snap = await db.collection(COL.usageCounters).doc(id).get();
  if (!snap.exists) return 0;
  const n = (snap.data() as { count?: number }).count ?? 0;
  return Number.isFinite(n) ? n : 0;
}

/** Build a 402-ish JSON response body for the gated case. Routes can spread this into NextResponse.json. */
export function quotaErrorBody(result: Extract<QuotaCheckResult, { ok: false }>): { error: string; help: string; current_tier?: UserPlan; required_tier?: UserPlan; metric?: MeteredAction; limit?: number; window?: Window } {
  if (result.reason === "tier_required") {
    return {
      error: "tier_required",
      help: `This feature requires the ${result.required} plan. You're currently on ${result.current}.`,
      current_tier: result.current,
      required_tier: result.required,
    };
  }
  return {
    error: "quota_exceeded",
    help: `You've used your ${result.window}ly allowance for ${result.metric} on the free tier. Upgrade to Pro to remove the cap.`,
    metric: result.metric,
    limit: result.limit,
    window: result.window,
  };
}

export const QUOTA_SPECS = SPECS;
