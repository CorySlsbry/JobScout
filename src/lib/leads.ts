// Data access for Upwork leads — jobs the inbox-watcher cron found in
// job-alert emails, scored, and (when verdict=apply) pre-drafted.
// Same Firestore-or-in-memory pattern as the rest of the app.
//
// Admin-only feature (the Gmail watcher only runs on the admin account), but
// every read/write is uid-scoped for hygiene.

import { getDb, COL } from "./firestore";
import { getStore } from "./seed";
import type { UpworkLead, UpworkLeadStatus } from "./types";

export async function listLeads(
  uid: string,
  opts: { includeStatuses?: UpworkLeadStatus[] } = {},
): Promise<UpworkLead[]> {
  const db = getDb();
  let leads: UpworkLead[];
  if (db) {
    // Single-field where + in-memory sort — avoids needing a composite
    // (user_id, discovered_at) index. Per-user lead count is small (<300).
    const snap = await db
      .collection(COL.upworkLeads)
      .where("user_id", "==", uid)
      .limit(300)
      .get();
    leads = snap.docs
      .map((d) => d.data() as UpworkLead)
      .sort((a, b) => (b.discovered_at ?? "").localeCompare(a.discovered_at ?? ""));
  } else {
    leads = (getStore().upworkLeads ?? []).filter((l) => l.user_id === uid);
  }
  if (opts.includeStatuses) {
    leads = leads.filter((l) => opts.includeStatuses!.includes(l.status));
  }
  // apply-verdict + highest score first, then most recent.
  return leads.sort((a, b) => {
    const av = a.verdict === "apply" ? 0 : 1;
    const bv = b.verdict === "apply" ? 0 : 1;
    if (av !== bv) return av - bv;
    if (b.score !== a.score) return b.score - a.score;
    return b.discovered_at.localeCompare(a.discovered_at);
  });
}

export async function getLead(uid: string, id: string): Promise<UpworkLead | null> {
  const db = getDb();
  if (db) {
    const snap = await db.collection(COL.upworkLeads).doc(id).get();
    if (!snap.exists) return null;
    const lead = snap.data() as UpworkLead;
    if (lead.user_id !== uid) return null;
    return lead;
  }
  const lead = (getStore().upworkLeads ?? []).find((l) => l.id === id);
  if (!lead || lead.user_id !== uid) return null;
  return lead;
}

// Returns the set of lead ids that already exist — used by the cron to skip
// jobs it has already scored, so re-processing an email is cheap/idempotent.
// Scoped to the owning uid so a future cohort of admin/users wouldn't collide.
export async function existingLeadIds(uid: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const db = getDb();
  if (db) {
    const found = new Set<string>();
    // Firestore "in" supports 30 ids per query; chunk it.
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      const snap = await db.collection(COL.upworkLeads)
        .where("__name__", "in", chunk.map((id) => db.collection(COL.upworkLeads).doc(id)))
        .get();
      snap.docs.forEach((d) => {
        const data = d.data() as UpworkLead;
        if (data.user_id === uid) found.add(d.id);
      });
    }
    return found;
  }
  const have = new Set((getStore().upworkLeads ?? []).filter((l) => l.user_id === uid).map((l) => l.id));
  return new Set(ids.filter((id) => have.has(id)));
}

// Caller is responsible for stamping user_id on the lead before calling.
export async function upsertLead(lead: UpworkLead): Promise<void> {
  const db = getDb();
  if (db) {
    await db.collection(COL.upworkLeads).doc(lead.id).set(lead);
    return;
  }
  const store = getStore();
  store.upworkLeads = store.upworkLeads ?? [];
  const idx = store.upworkLeads.findIndex((l) => l.id === lead.id);
  if (idx >= 0) store.upworkLeads[idx] = lead;
  else store.upworkLeads.push(lead);
}

export async function setLeadStatus(uid: string, id: string, status: UpworkLeadStatus): Promise<void> {
  const now = new Date().toISOString();
  const db = getDb();
  if (db) {
    const snap = await db.collection(COL.upworkLeads).doc(id).get();
    if (!snap.exists) return;
    const existing = snap.data() as UpworkLead;
    if (existing.user_id !== uid) return;
    await db.collection(COL.upworkLeads).doc(id).set({ status, updated_at: now }, { merge: true });
    return;
  }
  const lead = (getStore().upworkLeads ?? []).find((l) => l.id === id);
  if (lead && lead.user_id === uid) { lead.status = status; lead.updated_at = now; }
}

// Derive a stable lead doc id from an Upwork job id ("~0abc..." → "lead_0abc...").
export function leadIdFromJobId(jobId: string): string {
  return "lead_" + jobId.replace(/[^0-9a-z]/gi, "").toLowerCase();
}
