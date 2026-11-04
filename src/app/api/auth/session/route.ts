// Auth session cookie management.
// POST   { idToken }  → verify, mint a 14-day session cookie, return 200
// DELETE              → clear the cookie
//
// The client gets idToken from `await user.getIdToken()` after Firebase Auth
// signs them in (signInWithEmailAndPassword / signInWithPopup / signUp).

import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionCookie, verifyIdToken, SESSION_COOKIE_NAME, SESSION_TTL_MS } from "@/lib/auth";
import { recordEvent } from "@/lib/events-log";
import { getUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ idToken: z.string().min(20).max(8000) });

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  // Defence-in-depth: verify token shape AND signature before minting cookie.
  const decoded = await verifyIdToken(body.idToken);
  if (!decoded) return NextResponse.json({ error: "invalid_token" }, { status: 401 });

  // Must be a recent sign-in (≤5 min) to mint a cookie. Firebase enforces this.
  const cookie = await createSessionCookie(body.idToken, SESSION_TTL_MS);
  if (!cookie) return NextResponse.json({ error: "session_create_failed" }, { status: 500 });

  const res = NextResponse.json({ ok: true, uid: decoded.uid });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: cookie,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  // Analytics: always log session_created. If the User doc is fresh (<60s old)
  // this is a signup, not a returning login — fire that signal too. We don't
  // block the response on this.
  void (async () => {
    try {
      await recordEvent({
        name: "session_created",
        user_id: decoded.uid,
        user_agent: req.headers.get("user-agent"),
      });
      const userRow = await getUser(decoded.uid);
      if (userRow?.created_at) {
        const ageMs = Date.now() - new Date(userRow.created_at).getTime();
        if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 60_000) {
          await recordEvent({
            name: "signup_completed",
            user_id: decoded.uid,
            user_agent: req.headers.get("user-agent"),
            plan: userRow.plan,
          });
        }
      }
    } catch {/* analytics never throws */}
  })();

  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
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
