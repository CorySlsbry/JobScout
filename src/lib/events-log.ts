// In-house analytics — full event log (one doc per fire).
//
// We already had the per-day counter pattern in `usage_counters` under
// `evt__YYYY-MM-DD__name` doc ids. That gives totals + leaderboard but no
// session-level detail. This module ADDS a parallel detail collection (`events`)
// where every fire writes a row with timestamp, referrer, page, user, plan, etc.
// Volume is low for a new SaaS (target ~1-10K events/day), well inside
// Firestore's free tier. Sampling can be layered in later if needed.

import { getDb, COL } from "./firestore";

export type AnalyticsEventLog = {
  id: string;
  name: string;
  path: string | null;            // pathname the user was on, e.g. "/feed"
  referrer_domain: string | null; // referrer hostname only, e.g. "google.com"
  user_id: string | null;
  session_id: string | null;      // anonymous browser-cookie id, persists across visits
  user_agent: string | null;      // truncated to 200 chars
  plan: string | null;            // user's plan at the moment of the event ("free" | "pro" | "boost" | null)
  props: Record<string, string | number | boolean> | null;
  created_at: string;             // ISO timestamp
  created_day: string;            // YYYY-MM-DD UTC — for fast date-range queries
};

export type RecordEventInput = {
  name: string;
  path?: string | null;
  referrer_domain?: string | null;
  user_id?: string | null;
  session_id?: string | null;
  user_agent?: string | null;
  plan?: string | null;
  props?: Record<string, string | number | boolean> | null;
};

function makeId(): string {
  return "evt_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

const NAME_SAFE = /^[a-z0-9_-]{1,80}$/i;

/** Server-side event recorder. Safe to fire-and-forget — never throws. */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  const db = getDb();
  if (!db) return;
  if (!NAME_SAFE.test(input.name)) return;   // silently drop garbage names

  const now = new Date();
  const day = now.toISOString().slice(0, 10);

  const doc: AnalyticsEventLog = {
    id: makeId(),
    name: input.name,
    path: input.path?.slice(0, 200) ?? null,
    referrer_domain: input.referrer_domain?.slice(0, 200) ?? null,
    user_id: input.user_id ?? null,
    session_id: input.session_id?.slice(0, 80) ?? null,
    user_agent: input.user_agent?.slice(0, 200) ?? null,
    plan: input.plan ?? null,
    props: input.props ?? null,
    created_at: now.toISOString(),
    created_day: day,
  };

  try {
    await db.collection(COL.events).doc(doc.id).set(doc);
  } catch {
    // Best-effort. We never want analytics writes to take down a user request.
  }
}

/** Recent events for /admin/analytics — newest first. */
export async function listRecentEvents(limit = 500): Promise<AnalyticsEventLog[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const snap = await db.collection(COL.events).orderBy("created_at", "desc").limit(limit).get();
    return snap.docs.map((d) => d.data() as AnalyticsEventLog);
  } catch {
    return [];
  }
}

/** Count events matching `name` within the last `ms` milliseconds. */
export async function countEventsSince(name: string, ms: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const since = new Date(Date.now() - ms).toISOString();
  try {
    const agg = await db.collection(COL.events)
      .where("name", "==", name)
      .where("created_at", ">=", since)
      .count().get();
    return agg.data().count;
  } catch {
    // Fall back to bounded list if count() isn't available
    try {
      const snap = await db.collection(COL.events)
        .where("name", "==", name)
        .where("created_at", ">=", since)
        .limit(5000).get();
      return snap.size;
    } catch { return 0; }
  }
}
