// Append-only audit log. Every admin action + every irreversible user mutation
// gets a row here. Surfaces in /admin/audit so we can answer "who changed
// what when" without trawling Cloud Logs.
//
// Schema is intentionally loose — actions evolve, but the rows must stay
// queryable forever. Never mutate after write; never delete (except via the
// GDPR account-delete cascade, which is itself audited).

import { getDb, COL } from "./firestore";

export type AuditActorKind = "admin" | "user" | "system" | "stripe" | "cron";

export type AuditEntry = {
  id: string;
  /** Free-form action verb-object, e.g. "user.plan_grant", "account.delete", "stripe.subscription_updated". */
  action: string;
  actor_kind: AuditActorKind;
  actor_id: string | null;          // uid (admin or user). null for system/stripe/cron.
  actor_email: string | null;       // snapshotted at write time for readability
  /** What it touched. Use whichever subset makes sense. */
  target_user_id: string | null;    // the user being modified (often != actor_id for admin grants)
  target_resource: string | null;   // free-form: "subscription:sub_xxx", "job:linkedin__123", etc.
  /** Free-form metadata. Keep small — no full document dumps. */
  payload: Record<string, unknown> | null;
  /** Optional human-readable note rendered as-is in the admin UI. */
  note: string | null;
  created_at: string;
  /** YYYY-MM-DD UTC — for fast date-range filtering on the admin page. */
  created_day: string;
};

export type RecordAuditInput = {
  action: string;
  actor_kind: AuditActorKind;
  actor_id?: string | null;
  actor_email?: string | null;
  target_user_id?: string | null;
  target_resource?: string | null;
  payload?: Record<string, unknown> | null;
  note?: string | null;
};

function makeId(): string {
  return "aud_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

const ACTION_SAFE = /^[a-z][a-z0-9_.-]{1,80}$/i;

/** Fire-and-forget audit writer. Never throws. */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  const db = getDb();
  if (!db) return;
  if (!ACTION_SAFE.test(input.action)) return;   // silently drop malformed

  const now = new Date();
  const entry: AuditEntry = {
    id: makeId(),
    action: input.action,
    actor_kind: input.actor_kind,
    actor_id: input.actor_id ?? null,
    actor_email: input.actor_email ?? null,
    target_user_id: input.target_user_id ?? null,
    target_resource: input.target_resource ?? null,
    payload: input.payload ?? null,
    note: input.note ?? null,
    created_at: now.toISOString(),
    created_day: now.toISOString().slice(0, 10),
  };
  try {
    await db.collection(COL.auditLog).doc(entry.id).set(entry);
  } catch {/* never throw from the audit writer */}
}

/** Newest-first list for /admin/audit. Bounded so this never tanks. */
export async function listAuditEntries(limit = 500): Promise<AuditEntry[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const snap = await db.collection(COL.auditLog).orderBy("created_at", "desc").limit(limit).get();
    return snap.docs.map((d) => d.data() as AuditEntry);
  } catch {
    return [];
  }
}
