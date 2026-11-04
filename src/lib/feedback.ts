// Feedback CRUD — backs the FloatingOverlay (bug + feedback buttons) and the
// /admin/feedback triage table. Multi-tenant: every doc carries user_id (or
// null for visitors). Admin reads cross-user; users see only their own.

import { getDb, COL } from "./firestore";
import type { Feedback, FeedbackStatus, FeedbackType } from "./types";

function makeId(): string {
  return "fb_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export type CreateFeedbackInput = {
  type: FeedbackType;
  message: string;
  page_url: string;
  user_agent: string | null;
  user_id: string | null;
  user_email: string | null;
};

export async function createFeedback(input: CreateFeedbackInput): Promise<Feedback> {
  const now = new Date().toISOString();
  const id = makeId();
  const doc: Feedback = {
    id,
    user_id: input.user_id,
    user_email: input.user_email,
    type: input.type,
    message: input.message.trim().slice(0, 4000),  // hard cap to avoid abuse
    page_url: input.page_url.slice(0, 500),
    user_agent: input.user_agent?.slice(0, 500) ?? null,
    status: "open",
    admin_notes: null,
    created_at: now,
    resolved_at: null,
  };
  const db = getDb();
  if (db) {
    await db.collection(COL.feedback).doc(id).set(doc);
  }
  return doc;
}

/** Admin-only — pulls newest first across all users. Bounded to 200 by default. */
export async function listAllFeedback(limit = 200): Promise<Feedback[]> {
  const db = getDb();
  if (!db) return [];
  const snap = await db.collection(COL.feedback).orderBy("created_at", "desc").limit(limit).get();
  return snap.docs.map((d) => d.data() as Feedback);
}

export async function setFeedbackStatus(id: string, status: FeedbackStatus, adminNotes?: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const patch: Partial<Feedback> = {
    status,
    resolved_at: (status === "resolved" || status === "wont_fix") ? new Date().toISOString() : null,
  };
  if (adminNotes !== undefined) patch.admin_notes = adminNotes;
  await db.collection(COL.feedback).doc(id).set(patch, { merge: true });
}

/** For the admin dashboard tile — count of unresolved feedback. */
export async function getOpenFeedbackCount(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  try {
    const agg = await db.collection(COL.feedback).where("status", "in", ["open", "in_progress"]).count().get();
    return agg.data().count;
  } catch {
    const snap = await db.collection(COL.feedback).where("status", "==", "open").limit(500).get();
    return snap.size;
  }
}
