// CRUD for the resumes collection. The "active" resume is mirrored into
// profile.resume_md so the existing tailor / cover-letter / digest flows
// don't need to know about multi-resume.

import { getDb, COL } from "./firestore";
import { getStore } from "./seed";
import { updateProfile } from "./db";
import type { Resume, ResumeKind } from "./types";

function makeId(): string {
  return "res_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function listResumes(uid: string): Promise<Resume[]> {
  const db = getDb();
  if (db) {
    const snap = await db
      .collection(COL.resumes)
      .where("user_id", "==", uid)
      .get();
    const items = snap.docs.map((d) => d.data() as Resume);
    items.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return items;
  }
  // In-memory fallback: synthesize from the seed profile.resume_md so the
  // page has at least one item to render in dev.
  const profile = getStore().profile;
  if (!profile.resume_md) return [];
  const now = new Date().toISOString();
  return [{
    id: "res_seed_default",
    user_id: uid,
    name: "Default resume",
    content_md: profile.resume_md,
    source_filename: null,
    source_kind: "paste",
    is_active: true,
    created_at: now,
    updated_at: now,
  }];
}

export async function getResume(uid: string, id: string): Promise<Resume | null> {
  const db = getDb();
  if (db) {
    const snap = await db.collection(COL.resumes).doc(id).get();
    if (!snap.exists) return null;
    const resume = snap.data() as Resume;
    // Verify ownership — return null on mismatch so callers behave the same
    // as "not found".
    if (resume.user_id !== uid) return null;
    return resume;
  }
  const all = await listResumes(uid);
  return all.find((r) => r.id === id) ?? null;
}

export type CreateResumeInput = {
  name: string;
  content_md: string;
  source_kind: ResumeKind;
  source_filename?: string | null;
  setActive?: boolean;
};

export async function createResume(uid: string, input: CreateResumeInput): Promise<Resume> {
  const now = new Date().toISOString();
  const id = makeId();
  const setActive = input.setActive !== false; // default true: new uploads become active
  const doc: Resume = {
    id,
    user_id: uid,
    name: input.name.trim() || "Untitled resume",
    content_md: input.content_md,
    source_filename: input.source_filename ?? null,
    source_kind: input.source_kind,
    is_active: setActive,
    created_at: now,
    updated_at: now,
  };

  const db = getDb();
  if (db) {
    if (setActive) {
      // Flip every other resume to inactive in one batch. Single-field where +
      // in-memory is_active filter avoids a composite (user_id, is_active) index
      // that isn't auto-provisioned (would throw FAILED_PRECONDITION). Per-user
      // resume count is tiny.
      const batch = db.batch();
      const snap = await db.collection(COL.resumes).where("user_id", "==", uid).get();
      for (const d of snap.docs) {
        if ((d.data() as Resume).is_active) batch.update(d.ref, { is_active: false, updated_at: now });
      }
      batch.set(db.collection(COL.resumes).doc(id), doc);
      await batch.commit();
    } else {
      await db.collection(COL.resumes).doc(id).set(doc);
    }
    if (setActive) {
      await updateProfile(uid, { resume_md: input.content_md });
    }
  }

  return doc;
}

export async function setActiveResume(uid: string, id: string): Promise<Resume | null> {
  const target = await getResume(uid, id);
  if (!target) return null;
  const now = new Date().toISOString();

  const db = getDb();
  if (db) {
    const batch = db.batch();
    // Single-field where + in-memory is_active filter (no composite index).
    const snap = await db.collection(COL.resumes).where("user_id", "==", uid).get();
    for (const d of snap.docs) {
      if ((d.data() as Resume).is_active) batch.update(d.ref, { is_active: false, updated_at: now });
    }
    batch.update(db.collection(COL.resumes).doc(id), { is_active: true, updated_at: now });
    await batch.commit();
  }

  await updateProfile(uid, { resume_md: target.content_md });
  return { ...target, is_active: true, updated_at: now };
}

export async function renameResume(uid: string, id: string, name: string): Promise<Resume | null> {
  const db = getDb();
  if (!db) return null;
  // Ownership check before mutating.
  const existing = await getResume(uid, id);
  if (!existing) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const now = new Date().toISOString();
  await db.collection(COL.resumes).doc(id).update({ name: trimmed, updated_at: now });
  return getResume(uid, id);
}

export async function deleteResume(uid: string, id: string): Promise<{ deleted: boolean; promotedTo: string | null }> {
  const db = getDb();
  if (!db) return { deleted: false, promotedTo: null };

  const target = await getResume(uid, id);
  if (!target) return { deleted: false, promotedTo: null };

  await db.collection(COL.resumes).doc(id).delete();

  // If we deleted the active one, promote the next-most-recent.
  if (target.is_active) {
    const remaining = await listResumes(uid);
    const promote = remaining[0]; // listResumes sorts by created_at desc
    if (promote) {
      await setActiveResume(uid, promote.id);
      return { deleted: true, promotedTo: promote.id };
    }
    // No resumes left — clear profile.resume_md.
    await updateProfile(uid, { resume_md: null });
  }

  return { deleted: true, promotedTo: null };
}
