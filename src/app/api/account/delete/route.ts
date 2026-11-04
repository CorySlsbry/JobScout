// POST /api/account/delete
//
// Self-service GDPR-style account deletion. Hard delete (no grace period for v1).
// Requires the user to send { confirm: "DELETE" } in the body — typed
// confirmation prevents accidental triggers from CSRF-leaked sessions.
//
// Order of operations (each step independent — partial failures still make
// progress; the worst case is orphan docs that we sweep on a periodic cron):
//   1. Cancel Stripe subscription at period end (if any).
//   2. Delete every per-user doc in parallel across all uid-scoped collections.
//   3. Delete the User record in Firestore.
//   4. Delete the Firebase Auth user (irrevocable).
//   5. Clear the session cookie.
//
// We log via recordEvent("account_deleted") for the analytics dashboard.

import { NextResponse } from "next/server";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getDb, COL } from "@/lib/firestore";
import { getStripe } from "@/lib/stripe";
import { recordEvent } from "@/lib/events-log";
import { recordAudit } from "@/lib/audit-log";
import { getApps as getAdminApps, initializeApp as initAdminApp, applicationDefault } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ensureAdminApp() {
  if (getAdminApps().length) return;
  initAdminApp({ credential: applicationDefault(), projectId: process.env.GOOGLE_CLOUD_PROJECT });
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { confirm?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (body.confirm !== "DELETE") {
    return NextResponse.json({
      error: "confirmation_required",
      help: 'Send { "confirm": "DELETE" } to actually delete. This is a one-way operation.',
    }, { status: 400 });
  }

  const uid = session.uid;
  const db = getDb();
  if (!db) return NextResponse.json({ error: "firestore_not_configured" }, { status: 503 });

  const summary: Record<string, number | string | boolean> = { uid, started_at: new Date().toISOString() };

  // 1) Stripe — cancel subscription at period end if there is one.
  try {
    const stripe = getStripe();
    const subId = session.record?.stripe_subscription_id;
    if (stripe && subId) {
      await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
      summary.stripe_subscription = "scheduled_cancel_at_period_end";
    } else {
      summary.stripe_subscription = "none";
    }
  } catch (e) {
    summary.stripe_error = e instanceof Error ? e.message.slice(0, 120) : "unknown";
  }

  // 2) Delete every per-user doc. Each collection runs in parallel — previously
  //    sequential with paginated deletes inside, which could hit Cloud Run's
  //    60s wall-clock timeout for users with lots of data. Parallel cuts the
  //    worst case to ~the slowest single collection.
  const perUserCollections: Array<{ key: keyof typeof COL; queryField: string }> = [
    { key: "profile",      queryField: "user_id" },
    { key: "applications", queryField: "user_id" },
    { key: "resumes",      queryField: "user_id" },
    { key: "stories",      queryField: "user_id" },
    { key: "assessments",  queryField: "user_id" },
    { key: "upworkLeads",  queryField: "user_id" },
    { key: "feedback",     queryField: "user_id" },
    { key: "events",       queryField: "user_id" },
    { key: "compBenchmarks", queryField: "user_id" },
  ];

  const deleteCollection = async ({ key, queryField }: { key: keyof typeof COL; queryField: string }): Promise<{ name: string; count: number; error: string | null }> => {
    const colName = COL[key];
    try {
      // profile is keyed by uid as doc id; everything else is queried by user_id field.
      if (key === "profile") {
        await db.collection(colName).doc(uid).delete().catch(() => {});
        return { name: colName, count: 1, error: null };
      }
      let totalDeleted = 0;
      // Page through up to 5000 docs per collection (cap defensively)
      while (true) {
        const snap = await db.collection(colName).where(queryField, "==", uid).limit(400).get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        totalDeleted += snap.size;
        if (snap.size < 400 || totalDeleted >= 5000) break;
      }
      return { name: colName, count: totalDeleted, error: null };
    } catch (e) {
      return { name: colName, count: 0, error: e instanceof Error ? e.message.slice(0, 120) : "unknown" };
    }
  };

  const results = await Promise.all(perUserCollections.map(deleteCollection));
  for (const r of results) {
    summary[`${r.name}_deleted`] = r.count;
    if (r.error) summary[`${r.name}_error`] = r.error;
  }

  // 3) Delete the User doc itself
  try {
    await db.collection(COL.users).doc(uid).delete();
    summary.users_deleted = 1;
  } catch (e) {
    summary.users_error = e instanceof Error ? e.message.slice(0, 120) : "unknown";
  }

  // 4) Delete the Firebase Auth user
  try {
    ensureAdminApp();
    await getAdminAuth().deleteUser(uid);
    summary.firebase_auth_deleted = true;
  } catch (e) {
    summary.firebase_auth_error = e instanceof Error ? e.message.slice(0, 120) : "unknown";
  }

  // 5) Analytics breadcrumb + audit log.
  // AWAIT both — if we fire-and-forget, the response can return before the
  // audit write completes and we'd lose the only record of a destructive
  // mutation. recordAudit + recordEvent already swallow their own errors,
  // so this is safe to await.
  await Promise.allSettled([
    recordEvent({ name: "account_deleted", user_id: uid }),
    recordAudit({
      action: "account.delete",
      actor_kind: "user",
      actor_id: uid,
      actor_email: session.email,
      target_user_id: uid,
      payload: summary,
      note: "Self-service GDPR account deletion",
    }),
  ]);

  // 6) Clear session cookie
  const res = NextResponse.json({ ok: true, summary });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
