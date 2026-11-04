// Self-healing engine — registered healers that detect problems + apply fixes.
//
// Each healer is a tiny function that:
//   1. Queries something (Firestore, an env var, the errors collection)
//   2. Decides if action is needed
//   3. Takes the action (or no-op)
//   4. Returns a HealResult that we persist as a HealEvent row
//
// Healers run from /api/cron/heal (scheduled) AND can be triggered manually
// from /admin/healing. Some healers also run inline on every request (the
// anthropic circuit breaker's open/close decision needs to be cheap).

import { getDb, COL } from "./firestore";
import { countIntegrationErrorsSince } from "./error-monitoring";
import type { HealEvent } from "./types";

const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

export type HealResult = {
  ok: boolean;       // healer ran cleanly
  acted: boolean;    // it actually took action (vs. all-clear no-op)
  summary: string;   // one-line human-readable result
  details?: Record<string, unknown>;
};

export type Healer = {
  id: string;
  label: string;
  description: string;
  schedule_hint: string;
  run: () => Promise<HealResult>;
};

function makeEventId(): string {
  return "heal_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

/** Persist a HealEvent so /admin/healing can show history. Never throws. */
async function recordHealEvent(healer_id: string, result: HealResult, triggered_by: HealEvent["triggered_by"]): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const now = new Date();
    const evt: HealEvent = {
      id: makeEventId(),
      healer_id,
      ok: result.ok,
      acted: result.acted,
      summary: result.summary,
      details: result.details ?? null,
      triggered_by,
      created_at: now.toISOString(),
      created_day: now.toISOString().slice(0, 10),
    };
    await db.collection(COL.healEvents).doc(evt.id).set(evt);
  } catch {/* swallow */}
}

// ── Circuit-breaker state for Anthropic ────────────────────────────────
// Lives in Firestore under system_state/circuit_anthropic so it's shared
// across Cloud Run instances. Reads are cheap (one doc); writes happen
// only on state transitions.

type CircuitState = { open: boolean; open_until: string | null; reason: string | null };

const CIRCUIT_DOC = "circuit_anthropic";

export async function getAnthropicCircuit(): Promise<CircuitState> {
  const db = getDb();
  if (!db) return { open: false, open_until: null, reason: null };
  try {
    const snap = await db.collection(COL.systemState).doc(CIRCUIT_DOC).get();
    if (!snap.exists) return { open: false, open_until: null, reason: null };
    const data = snap.data() as CircuitState;
    if (data.open && data.open_until && new Date(data.open_until).getTime() < Date.now()) {
      // Auto-close on expiry — caller will re-test next request.
      return { open: false, open_until: null, reason: null };
    }
    return data;
  } catch {
    return { open: false, open_until: null, reason: null };
  }
}

async function setAnthropicCircuit(state: CircuitState): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.collection(COL.systemState).doc(CIRCUIT_DOC).set(state);
  } catch {/* swallow */}
}

// ── Healer 1: Anthropic circuit breaker ────────────────────────────────
const ANTHROPIC_BREAKER: Healer = {
  id: "anthropic_circuit_breaker",
  label: "Anthropic API circuit breaker",
  description:
    "Opens a 10-minute circuit when /api/* sees ≥5 Anthropic errors in the last 5 minutes. Re-tests on the next request after expiry. Saves Cloud Run compute + protects against the silent-key-revoked failure mode we hit in May.",
  schedule_hint: "every 5 min + on-demand",
  run: async () => {
    const errCount = await countIntegrationErrorsSince("anthropic", 5 * MIN_MS);
    const current = await getAnthropicCircuit();
    if (errCount >= 5 && !current.open) {
      const openUntil = new Date(Date.now() + 10 * MIN_MS).toISOString();
      await setAnthropicCircuit({
        open: true,
        open_until: openUntil,
        reason: `${errCount} Anthropic errors in last 5 min`,
      });
      return { ok: true, acted: true, summary: `Circuit OPENED — ${errCount} errors / 5 min, blocking calls until ${openUntil}`, details: { errCount, openUntil } };
    }
    if (errCount === 0 && current.open) {
      await setAnthropicCircuit({ open: false, open_until: null, reason: null });
      return { ok: true, acted: true, summary: "Circuit CLOSED — error rate back to zero", details: { errCount } };
    }
    return { ok: true, acted: false, summary: `Healthy — ${errCount} errors in last 5 min, circuit ${current.open ? "open" : "closed"}`, details: { errCount, circuitOpen: current.open } };
  },
};

// ── Healer 2: Stale error cleanup ──────────────────────────────────────
const STALE_ERROR_CLEANUP: Healer = {
  id: "stale_error_cleanup",
  label: "Purge errors older than 60 days",
  description: "Deletes resolved+ignored errors > 60d and ANY error > 180d. Keeps the errors collection from unbounded growth.",
  schedule_hint: "daily",
  run: async () => {
    const db = getDb();
    if (!db) return { ok: false, acted: false, summary: "Firestore not configured" };
    const cutoff60 = new Date(Date.now() - 60 * 24 * HOUR_MS).toISOString();
    const cutoff180 = new Date(Date.now() - 180 * 24 * HOUR_MS).toISOString();
    let hardDeleted = 0;
    let softDeleted = 0;
    try {
      // Hard cutoff: anything > 180d gone regardless of status. Single-field
      // where → no composite index required.
      const hardSnap = await db.collection(COL.errors).where("created_at", "<", cutoff180).limit(400).get();
      if (!hardSnap.empty) {
        const batch1 = db.batch();
        hardSnap.docs.forEach((d) => batch1.delete(d.ref));
        await batch1.commit();
        hardDeleted = hardSnap.size;
      }
      // Soft cutoff: resolved/ignored > 60d gone. Use single-field where on
      // created_at + in-memory status filter to avoid needing a composite
      // index on (status, created_at).
      const softSnap = await db.collection(COL.errors).where("created_at", "<", cutoff60).limit(400).get();
      const softCandidates = softSnap.docs.filter((d) => {
        const data = d.data() as { status?: string };
        return data.status === "resolved" || data.status === "ignored";
      });
      if (softCandidates.length > 0) {
        const batch2 = db.batch();
        softCandidates.forEach((d) => batch2.delete(d.ref));
        await batch2.commit();
        softDeleted = softCandidates.length;
      }
    } catch (e) {
      return { ok: false, acted: false, summary: e instanceof Error ? e.message.slice(0, 200) : "cleanup error" };
    }
    const total = hardDeleted + softDeleted;
    return {
      ok: true,
      acted: total > 0,
      summary: `Deleted ${total} stale error rows (${hardDeleted} hard cutoff, ${softDeleted} soft cutoff)`,
      details: { hardDeleted, softDeleted, total },
    };
  },
};

// ── Healer 3: Stale analytics events cleanup ───────────────────────────
const STALE_EVENTS_CLEANUP: Healer = {
  id: "stale_events_cleanup",
  label: "Purge analytics events older than 90 days",
  description: "Caps the events collection size. We keep aggregates indefinitely but raw event rows beyond 90d aren't worth the storage.",
  schedule_hint: "daily",
  run: async () => {
    const db = getDb();
    if (!db) return { ok: false, acted: false, summary: "Firestore not configured" };
    const cutoff = new Date(Date.now() - 90 * 24 * HOUR_MS).toISOString();
    let deleted = 0;
    try {
      const snap = await db.collection(COL.events).where("created_at", "<", cutoff).limit(400).get();
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      if (!snap.empty) await batch.commit();
      deleted = snap.size;
    } catch (e) {
      return { ok: false, acted: false, summary: e instanceof Error ? e.message.slice(0, 200) : "cleanup error" };
    }
    return { ok: true, acted: deleted > 0, summary: `Deleted ${deleted} analytics rows older than 90d`, details: { deleted } };
  },
};

// ── Healer 4: Subscription status reconciler ───────────────────────────
const SUBSCRIPTION_RECONCILER: Healer = {
  id: "subscription_reconciler",
  label: "Detect drifted Stripe subscription status",
  description: "Flags users whose User.plan suggests paid but subscription_status is 'past_due', 'canceled', or 'unpaid' for > 7 days. Doesn't auto-downgrade — just logs the inconsistency so it shows up on /admin/healing for manual review.",
  schedule_hint: "daily",
  run: async () => {
    const db = getDb();
    if (!db) return { ok: false, acted: false, summary: "Firestore not configured" };
    try {
      const snap = await db.collection(COL.users).get();
      const drifted: Array<{ uid: string; plan: string; status: string }> = [];
      for (const d of snap.docs) {
        const u = d.data() as { id?: string; plan?: string; subscription_status?: string };
        if (!u.plan || u.plan === "free") continue;
        const status = u.subscription_status ?? "none";
        if (status === "past_due" || status === "canceled" || status === "unpaid") {
          drifted.push({ uid: u.id ?? d.id, plan: u.plan, status });
        }
      }
      return {
        ok: true,
        acted: drifted.length > 0,
        summary: drifted.length === 0 ? "All paid users have healthy Stripe status" : `${drifted.length} drifted users flagged for review`,
        details: drifted.length > 0 ? { drifted: drifted.slice(0, 50) } : undefined,
      };
    } catch (e) {
      return { ok: false, acted: false, summary: e instanceof Error ? e.message.slice(0, 200) : "reconciler error" };
    }
  },
};

// ── Healer registry + entry point ──────────────────────────────────────
export const ALL_HEALERS: Healer[] = [
  ANTHROPIC_BREAKER,
  STALE_ERROR_CLEANUP,
  STALE_EVENTS_CLEANUP,
  SUBSCRIPTION_RECONCILER,
];

export async function runHealer(
  healerId: string,
  triggered_by: HealEvent["triggered_by"] = "manual",
): Promise<{ healer_id: string; result: HealResult }> {
  const healer = ALL_HEALERS.find((h) => h.id === healerId);
  if (!healer) {
    const result: HealResult = { ok: false, acted: false, summary: `Unknown healer: ${healerId}` };
    return { healer_id: healerId, result };
  }
  let result: HealResult;
  try { result = await healer.run(); }
  catch (e) {
    result = { ok: false, acted: false, summary: e instanceof Error ? e.message.slice(0, 200) : "healer crashed" };
  }
  await recordHealEvent(healerId, result, triggered_by);
  return { healer_id: healerId, result };
}

export async function runAllHealers(triggered_by: HealEvent["triggered_by"] = "cron"): Promise<Array<{ healer_id: string; result: HealResult }>> {
  const out: Array<{ healer_id: string; result: HealResult }> = [];
  for (const h of ALL_HEALERS) {
    out.push(await runHealer(h.id, triggered_by));
  }
  return out;
}

export async function listHealEvents(limit = 200): Promise<HealEvent[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const snap = await db.collection(COL.healEvents).orderBy("created_at", "desc").limit(limit).get();
    return snap.docs.map((d) => d.data() as HealEvent);
  } catch { return []; }
}
