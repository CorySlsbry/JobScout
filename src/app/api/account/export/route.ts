// GET /api/account/export
//
// GDPR data-portability export. Returns a single JSON file containing
// EVERY user-owned doc across the data layer. Filename:
//   jobscout-export-<email>-<YYYY-MM-DD>.json
//
// Intentional choices:
//   • One JSON file (not ZIP) — cleaner for browser download + easy to
//     pretty-print + machine-readable for the user's next tool.
//   • Includes raw Firestore docs from every per-user collection
//     (profile, applications, resumes, stories, assessments, upwork_leads,
//     feedback). Plus the user row.
//   • Strips internal Stripe customer/subscription ids (the user has a
//     Stripe Customer Portal for that — we don't need to leak it here).

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb, COL } from "@/lib/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "firestore_not_configured" }, { status: 503 });

  const uid = session.uid;

  // Collections that are uid-keyed in our schema.
  // Applications use doc id `${uid}__${jobId}` AND have a user_id field.
  const [userSnap, profileSnap, applicationsSnap, resumesSnap, storiesSnap, assessmentsSnap, leadsSnap, feedbackSnap] = await Promise.all([
    db.collection(COL.users).doc(uid).get(),
    db.collection(COL.profile).doc(uid).get(),
    db.collection(COL.applications).where("user_id", "==", uid).get(),
    db.collection(COL.resumes).where("user_id", "==", uid).get(),
    db.collection(COL.stories).where("user_id", "==", uid).get(),
    db.collection(COL.assessments).where("user_id", "==", uid).get(),
    db.collection(COL.upworkLeads).where("user_id", "==", uid).get(),
    db.collection(COL.feedback).where("user_id", "==", uid).get(),
  ]);

  const user = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : null;
  // Strip Stripe ids — covered by Stripe's own portal.
  if (user) {
    delete user.stripe_customer_id;
    delete user.stripe_subscription_id;
  }

  const exportPayload = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    note: "JobScout user data export. Personal data only — no shared job pool, no other users' data.",
    user,
    profile: profileSnap.exists ? profileSnap.data() : null,
    applications: applicationsSnap.docs.map((d) => d.data()),
    resumes:      resumesSnap.docs.map((d) => d.data()),
    stories:      storiesSnap.docs.map((d) => d.data()),
    assessments:  assessmentsSnap.docs.map((d) => d.data()),
    upwork_leads: leadsSnap.docs.map((d) => d.data()),
    feedback:     feedbackSnap.docs.map((d) => d.data()),
  };

  const day = new Date().toISOString().slice(0, 10);
  const emailPart = (session.email ?? uid).replace(/[^a-z0-9._-]/gi, "_");
  const filename = `jobscout-export-${emailPart}-${day}.json`;

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // GDPR-style explicit no-cache: this is one-time download, never cache PII.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
