// Gmail OAuth — step 1: redirect to Google's consent screen.
//
// Setup (one-time):
//   1. In Google Cloud Console (project jobscout-app) → APIs & Services →
//      Credentials → Create OAuth client ID → Web application.
//   2. Add authorized redirect URI:
//        https://<cloud-run-url>/api/oauth/gmail/callback
//   3. Enable the Gmail API for the project.
//   4. Set on Cloud Run: GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET,
//      and OAUTH_BASE_URL (the Cloud Run URL).
//
// Admin-only — only the JobScout owner connects their inbox.

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { publicAppUrl } from "@/lib/url";
import { gmailAuthUrl } from "@/lib/gmail";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || !user.is_admin) {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }

  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({
      error: "gmail_oauth_not_configured",
      help: "Create a Web-application OAuth client in Google Cloud Console, enable the Gmail API, and set GMAIL_OAUTH_CLIENT_ID + GMAIL_OAUTH_CLIENT_SECRET on Cloud Run.",
    }, { status: 503 });
  }

  const baseUrl = publicAppUrl(req);
  const redirectUri = `${baseUrl}/api/oauth/gmail/callback`;
  const state = randomBytes(16).toString("hex");

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: gmailAuthUrl(clientId, redirectUri, state),
      "Set-Cookie": `gmail_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure`,
    },
  });
}
