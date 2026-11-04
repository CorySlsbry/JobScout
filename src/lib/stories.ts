// Data access for STAR+R interview stories. Same Firestore-or-in-memory
// pattern as the rest of the app — uid-scoped per user.

import { getDb, COL } from "./firestore";
import { getStore } from "./seed";
import type { InterviewStory } from "./types";

export async function listStories(uid: string): Promise<InterviewStory[]> {
  const db = getDb();
  if (db) {
    // Single-field where + in-memory sort — avoids needing a composite
    // (user_id, updated_at) index. Per-user story count is small (<200).
    const snap = await db
      .collection(COL.stories)
      .where("user_id", "==", uid)
      .limit(200)
      .get();
    return snap.docs
      .map((d) => d.data() as InterviewStory)
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  }
  return (getStore().stories ?? [])
    .filter((s) => s.user_id === uid)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getStory(uid: string, id: string): Promise<InterviewStory | null> {
  const db = getDb();
  if (db) {
    const snap = await db.collection(COL.stories).doc(id).get();
    if (!snap.exists) return null;
    const story = snap.data() as InterviewStory;
    if (story.user_id !== uid) return null;
    return story;
  }
  const found = (getStore().stories ?? []).find((s) => s.id === id);
  if (!found || found.user_id !== uid) return null;
  return found;
}

export async function upsertStory(
  uid: string,
  s: Omit<InterviewStory, "user_id" | "created_at" | "updated_at">,
): Promise<InterviewStory> {
  const now = new Date().toISOString();
  const db = getDb();
  if (db) {
    const ref = db.collection(COL.stories).doc(s.id);
    const existingSnap = await ref.get();
    const existing = existingSnap.exists ? (existingSnap.data() as InterviewStory) : undefined;
    // Defend against cross-tenant overwrite.
    if (existing && existing.user_id !== uid) {
      throw new Error("story_owned_by_other_user");
    }
    const next: InterviewStory = {
      ...s,
      user_id: uid,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    await ref.set(next);
    return next;
  }
  const store = getStore();
  store.stories = store.stories ?? [];
  const existing = store.stories.find((x) => x.id === s.id);
  if (existing && existing.user_id !== uid) {
    throw new Error("story_owned_by_other_user");
  }
  const next: InterviewStory = {
    ...s,
    user_id: uid,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  if (existing) Object.assign(existing, next);
  else store.stories.push(next);
  return next;
}

export async function deleteStory(uid: string, id: string): Promise<void> {
  const db = getDb();
  if (db) {
    const snap = await db.collection(COL.stories).doc(id).get();
    if (!snap.exists) return;
    const story = snap.data() as InterviewStory;
    if (story.user_id !== uid) return;
    await db.collection(COL.stories).doc(id).delete();
    return;
  }
  const store = getStore();
  store.stories = (store.stories ?? []).filter((s) => !(s.id === id && s.user_id === uid));
}

export function newStoryId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
