// Data access for saved assessment results (Zapier AI Fluency, HackerRank,
// portfolio reviews, etc.). Same Firestore-or-in-memory pattern as the
// other domain libs — uid-scoped per user.
//
// Active assessments are auto-included in every prompt the scorer / cover-
// letter / bid-drafter / resume-tailor builds. Inactive ones are kept for
// reference but skipped.

import { getDb, COL } from "./firestore";
import { getStore } from "./seed";
import type { Assessment } from "./types";

export async function listAssessments(
  uid: string,
  opts: { activeOnly?: boolean } = {},
): Promise<Assessment[]> {
  const db = getDb();
  let items: Assessment[];
  if (db) {
    // Single-field where + in-memory sort — composite (user_id, updated_at)
    // index isn't reliably present and a missing one throws FAILED_PRECONDITION
    // mid-render. Per-user assessment count is tiny (<50 per user) so the
    // in-memory sort is free.
    const snap = await db
      .collection(COL.assessments)
      .where("user_id", "==", uid)
      .limit(50)
      .get();
    items = snap.docs
      .map((d) => d.data() as Assessment)
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  } else {
    items = (getStore().assessments ?? [])
      .filter((a) => a.user_id === uid)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  return opts.activeOnly ? items.filter((a) => a.is_active) : items;
}

export async function getAssessment(uid: string, id: string): Promise<Assessment | null> {
  const db = getDb();
  if (db) {
    const snap = await db.collection(COL.assessments).doc(id).get();
    if (!snap.exists) return null;
    const assessment = snap.data() as Assessment;
    if (assessment.user_id !== uid) return null;
    return assessment;
  }
  const found = (getStore().assessments ?? []).find((a) => a.id === id);
  if (!found || found.user_id !== uid) return null;
  return found;
}

export async function upsertAssessment(
  uid: string,
  a: Omit<Assessment, "user_id" | "created_at" | "updated_at">,
): Promise<Assessment> {
  const now = new Date().toISOString();
  const db = getDb();
  if (db) {
    const ref = db.collection(COL.assessments).doc(a.id);
    const existingSnap = await ref.get();
    const existing = existingSnap.exists ? (existingSnap.data() as Assessment) : undefined;
    if (existing && existing.user_id !== uid) {
      throw new Error("assessment_owned_by_other_user");
    }
    const next: Assessment = {
      ...a,
      user_id: uid,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    await ref.set(next);
    return next;
  }
  const store = getStore();
  store.assessments = store.assessments ?? [];
  const existing = store.assessments.find((x) => x.id === a.id);
  if (existing && existing.user_id !== uid) {
    throw new Error("assessment_owned_by_other_user");
  }
  const next: Assessment = {
    ...a,
    user_id: uid,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  if (existing) Object.assign(existing, next);
  else store.assessments.push(next);
  return next;
}

export async function deleteAssessment(uid: string, id: string): Promise<void> {
  const db = getDb();
  if (db) {
    const snap = await db.collection(COL.assessments).doc(id).get();
    if (!snap.exists) return;
    const assessment = snap.data() as Assessment;
    if (assessment.user_id !== uid) return;
    await db.collection(COL.assessments).doc(id).delete();
    return;
  }
  const store = getStore();
  store.assessments = (store.assessments ?? []).filter((a) => !(a.id === id && a.user_id === uid));
}

export function newAssessmentId(): string {
  return "asm_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

// Build the markdown block JobScout's scorer/drafter prompts inject when
// active assessments exist. Empty string when none.
export async function activeAssessmentsContext(uid: string): Promise<string> {
  const items = await listAssessments(uid, { activeOnly: true });
  if (!items.length) return "";
  return items.map((a, i) =>
    `## Assessment ${i + 1}: ${a.name}\n` +
    (a.source_url ? `_Source: ${a.source_url}_\n\n` : "") +
    a.summary_md.trim()
  ).join("\n\n---\n\n");
}
