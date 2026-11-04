// LinkedIn OAuth — step 2: exchange code for token, fetch profile, save to Firestore.

import { NextResponse } from "next/server";
import { getDb, COL } from "@/lib/firestore";
import { publicAppUrl } from "@/lib/url";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const baseUrl = publicAppUrl(req);

  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.redirect(`${baseUrl}/signin?next=/settings`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return NextResponse.redirect(`${baseUrl}/settings?linkedin=denied`);
  if (!code || !state) return NextResponse.redirect(`${baseUrl}/settings?linkedin=invalid`);

  // CSRF: state must match the cookie set in /start.
  const cookie = req.headers.get("cookie") ?? "";
  const cookieState = cookie.split(";").map(s => s.trim()).find(s => s.startsWith("linkedin_oauth_state="))?.split("=")[1];
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(`${baseUrl}/settings?linkedin=state_mismatch`);
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/settings?linkedin=server_missing_keys`);
  }

  // Exchange code for access token.
  const tokenResp = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${baseUrl}/api/oauth/linkedin/callback`,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!tokenResp.ok) {
    return NextResponse.redirect(`${baseUrl}/settings?linkedin=token_failed`);
  }
  const tokenJson = await tokenResp.json() as { access_token?: string; expires_in?: number };
  const accessToken = tokenJson.access_token;
  if (!accessToken) return NextResponse.redirect(`${baseUrl}/settings?linkedin=no_token`);

  // Fetch the OpenID-flavored profile.
  const meResp = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meResp.ok) return NextResponse.redirect(`${baseUrl}/settings?linkedin=profile_failed`);
  const me = await meResp.json() as { sub?: string; email?: string; name?: string; picture?: string };

  // Persist on the user's profile doc.
  const db = getDb();
  if (db) {
    await db.collection(COL.profile).doc(sessionUser.uid).set({
      linkedin: {
        sub: me.sub ?? null,
        email: me.email ?? null,
        name: me.name ?? null,
        picture: me.picture ?? null,
        access_token: accessToken,         // TODO: encrypt at rest
        expires_at: tokenJson.expires_in ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString() : null,
        connected_at: new Date().toISOString(),
      },
    }, { merge: true });
  }

  return NextResponse.redirect(`${baseUrl}/settings?linkedin=connected`);
}
