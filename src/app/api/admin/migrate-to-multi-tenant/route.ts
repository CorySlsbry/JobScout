// POST /api/admin/migrate-to-multi-tenant
//
// One-shot migration that re-keys all of Cory's single-tenant data
// (profile/me + every row with user_id="me") to his real Firebase UID.
// After this runs, the app is safe to flip into multi-tenant mode where
// `userId` is required on every read/write.
//
// Idempotent — re-running it is a no-op once rows already carry the UID
// and applications already use the `{uid}__{jobId}` doc-id convention.
//
// Admin-only (must be Cory's session) AND requires ?confirm=YES_MIGRATE
// to fire — protects against accidental triggers.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, COL } from "@/lib/firestore";
import { recordAudit } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LEGACY_USER_ID = "me";

// Collections that carry a `user_id` field. `applications` is handled
// specially (doc-id re-key) so it's excluded from this list.
const COLLECTIONS_WITH_USER_ID: Array<keyof typeof COL> = [
  "jobs",
  "resumes",
  "stories",
  "assessments",
  "upworkLeads",
];

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !user.is_admin) {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }
  const url = new URL(req.url);
  if (url.searchParams.get("confirm") !== "YES_MIGRATE") {
    return NextResponse.json({
      error: "confirm_required",
      help: "Append ?confirm=YES_MIGRATE to actually run the migration.",
    }, { status: 400 });
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "firestore_not_configured" }, { status: 503 });
  }

  const targetUid = user.uid;
  const summary: Record<string, number> = {};

  // 1) Move profile/me → profile/{uid}.
  const legacyProfile = await db.collection(COL.profile).doc(LEGACY_USER_ID).get();
  if (legacyProfile.exists) {
    const data = legacyProfile.data() as Record<string, unknown>;
    const targetRef = db.collection(COL.profile).doc(targetUid);
    const existing = await targetRef.get();
    if (!existing.exists) {
      await targetRef.set({ ...data, user_id: targetUid });
      summary.profile_migrated = 1;
    } else {
      summary.profile_already_present = 1;
    }
  } else {
    summary.profile_no_legacy_doc = 1;
  }

  // 2) Re-key user_id on every collection that carries it (excluding
  // applications — those get a doc-id rewrite below).
  for (const key of COLLECTIONS_WITH_USER_ID) {
    const colName = COL[key];
    const snap = await db.collection(colName).where("user_id", "==", LEGACY_USER_ID).get();
    let n = 0;
    // Firestore batched writes max 500 ops; chunk if needed.
    const chunks: Array<typeof snap.docs> = [];
    for (let i = 0; i < snap.docs.length; i += 400) chunks.push(snap.docs.slice(i, i + 400));
    for (const chunk of chunks) {
      const batch = db.batch();
      for (const d of chunk) {
        batch.update(d.ref, { user_id: targetUid });
        n++;
      }
      await batch.commit();
    }
    summary[colName] = n;
  }

  // 3) Applications: doc-id is changing from `{jobId}` to `{uid}__{jobId}`,
  // and every doc now needs `user_id: uid` stamped on it. Copy → delete legacy.
  // Idempotent: if `{uid}__{jobId}` already exists we skip the copy.
  const applicationsSnap = await db.collection(COL.applications).get();
  let appsCopied = 0;
  let appsSkippedExists = 0;
  let appsAlreadyMigrated = 0;
  let appsFieldStamped = 0;

  for (const doc of applicationsSnap.docs) {
    const docId = doc.id;
    const data = doc.data() as Record<string, unknown>;

    // Already-migrated docs use the composite key — skip but stamp user_id
    // if it was somehow missing.
    if (docId.includes("__")) {
      if (!data.user_id) {
        await doc.ref.set({ user_id: targetUid }, { merge: true });
        appsFieldStamped++;
      }
      appsAlreadyMigrated++;
      continue;
    }

    // Legacy {jobId}-only doc. Migrate it.
    const jobId = (data.job_id as string | undefined) ?? docId;
    const newId = `${targetUid}__${jobId}`;
    const newRef = db.collection(COL.applications).doc(newId);
    const existing = await newRef.get();
    if (existing.exists) {
      // Already migrated; safe to delete the legacy doc.
      await doc.ref.delete();
      appsSkippedExists++;
      continue;
    }
    await newRef.set({ ...data, id: newId, user_id: targetUid, job_id: jobId });
    await doc.ref.delete();
    appsCopied++;
  }

  summary.applications_migrated = appsCopied;
  summary.applications_skipped_already_exists = appsSkippedExists;
  summary.applications_already_migrated = appsAlreadyMigrated;
  summary.applications_user_id_stamped = appsFieldStamped;

  await recordAudit({
    action: "admin.migrate_to_multi_tenant",
    actor_kind: "admin",
    actor_id: user.uid,
    actor_email: user.email,
    target_user_id: targetUid,
    payload: summary,
    note: "Re-keyed legacy profile/me + applications + per-collection user_id fields",
  });

  return NextResponse.json({
    ok: true,
    target_uid: targetUid,
    summary,
    note: "Legacy profile/me doc was NOT deleted — it's the safety net. Delete manually once you've verified the new profile/{uid} works.",
  });
}
