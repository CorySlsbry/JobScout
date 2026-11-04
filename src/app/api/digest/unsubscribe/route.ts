// One-click unsubscribe endpoint. Hit by the List-Unsubscribe header
// (Gmail/Apple Mail) and the unsubscribe link in the email body.
//
// Public route — no session. We resolve the user by looking up the
// `digest_unsubscribe_token` field on the profile collection.

import { NextResponse } from "next/server";
import { updateProfile } from "@/lib/db";
import { getDb, COL } from "@/lib/firestore";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function unsubscribe(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "firestore_not_configured" }, { status: 503 });
  }

  // Find the profile that owns this token. Tokens are rotated per send so
  // they're effectively single-use; this scan only touches matching docs.
  const snap = await db
    .collection(COL.profile)
    .where("digest_unsubscribe_token", "==", token)
    .limit(1)
    .get();
  if (snap.empty) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const profile = snap.docs[0].data() as Profile;
  if (!profile.user_id) {
    return NextResponse.json({ error: "profile_missing_user_id" }, { status: 500 });
  }

  await updateProfile(profile.user_id, { digest_frequency: "off", digest_unsubscribe_token: null });
  return new Response(`<!doctype html><html><body style="font-family:system-ui;background:#0a0613;color:#f5f3ff;padding:48px;text-align:center">
    <h1 style="font-size:22px;margin:0 0 8px 0">You're unsubscribed.</h1>
    <p style="color:#8b85a8;font-size:14px">No more JobScout digest emails. You can re-enable any time from Settings.</p>
    <p style="margin-top:24px"><a href="${url.origin}/settings" style="color:#a855f7">Open settings →</a></p>
  </body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export const GET = unsubscribe;
export const POST = unsubscribe;  // Gmail's List-Unsubscribe-Post hits POST
