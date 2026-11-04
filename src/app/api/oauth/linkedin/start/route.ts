// LinkedIn OAuth — step 1: redirect the user to LinkedIn's authorize page.
// To enable this, register an app at https://www.linkedin.com/developers/apps,
// add `${BASE_URL}/api/oauth/linkedin/callback` to the redirect URLs, and set:
//   LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, OAUTH_BASE_URL (e.g. your Cloud Run URL)

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { publicAppUrl } from "@/lib/url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const baseUrl = publicAppUrl(req);
  if (!clientId) {
    return NextResponse.json({
      error: "linkedin_oauth_not_configured",
      help: "Register an app at https://www.linkedin.com/developers/apps and set LINKEDIN_CLIENT_ID + LINKEDIN_CLIENT_SECRET + OAUTH_BASE_URL on the Cloud Run service.",
    }, { status: 503 });
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = `${baseUrl}/api/oauth/linkedin/callback`;
  const scope = ["openid", "profile", "email"].join(" ");

  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);

  // Pass state via cookie for CSRF check on callback.
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      "Set-Cookie": `linkedin_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure`,
    },
  });
}
