// Gmail OAuth — step 2: exchange code for tokens, store the refresh token
// on the profile, redirect back to /settings.

import { NextResponse } from "next/server";
import { publicAppUrl } from "@/lib/url";
import { exchangeCodeForTokens } from "@/lib/gmail";
import { updateProfile } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { applyRateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Helper — return a redirect response with the OAuth state cookie cleared,
// so the CSRF token can't be replayed. Called from every exit path below.
function redirectAndClearState(target: string): NextResponse {
  const res = NextResponse.redirect(target);
  res.cookies.set({ name: "gmail_oauth_state", value: "", path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
  return res;
}

export async function GET(req: Request) {
  if (applyRateLimit("oauth-gmail-cb", clientIp(req), { capacity: 20, refillPerMin: 20 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const url = new URL(req.url);
  const baseUrl = publicAppUrl(req);

  // OAuth callback must be tied to a logged-in user — that's whose profile
  // gets the refresh token. If session expired during the OAuth round-trip,
  // bounce them back to sign in.
  const sessionUser = await getSessionUser();
  if (!sessionUser) return redirectAndClearState(`${baseUrl}/signin?next=/settings`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return redirectAndClearState(`${baseUrl}/settings?gmail=denied`);
  if (!code || !state) return redirectAndClearState(`${baseUrl}/settings?gmail=invalid`);

  // CSRF: state must match the cookie set in /start.
  const cookie = req.headers.get("cookie") ?? "";
  const cookieState = cookie.split(";").map((s) => s.trim()).find((s) => s.startsWith("gmail_oauth_state="))?.split("=")[1];
  if (!cookieState || cookieState !== state) {
    return redirectAndClearState(`${baseUrl}/settings?gmail=state_mismatch`);
  }

  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectAndClearState(`${baseUrl}/settings?gmail=server_missing_keys`);
  }

  const redirectUri = `${baseUrl}/api/oauth/gmail/callback`;
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, clientId, clientSecret, redirectUri);
  } catch {
    return redirectAndClearState(`${baseUrl}/settings?gmail=token_failed`);
  }
  if (!tokens.refresh_token) {
    // Google only returns refresh_token on first consent. prompt=consent in
    // /start forces it, but guard anyway.
    return redirectAndClearState(`${baseUrl}/settings?gmail=no_refresh_token`);
  }

  // Best-effort: read the connected address from the user's profile.
  let connectedEmail: string | null = null;
  try {
    const profileResp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (profileResp.ok) {
      connectedEmail = ((await profileResp.json()) as { emailAddress?: string }).emailAddress ?? null;
    }
  } catch { /* non-fatal */ }

  await updateProfile(sessionUser.uid, {
    gmail_refresh_token: tokens.refresh_token,        // TODO: encrypt at rest
    gmail_connected_email: connectedEmail,
    gmail_connected_at: new Date().toISOString(),
  });

  return redirectAndClearState(`${baseUrl}/settings?gmail=connected`);
}
