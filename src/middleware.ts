// Auth gate. Runs at the edge before every request hits the app.
//
// Public routes are listed in PUBLIC_PATHS — everything else requires the
// session cookie minted by /api/auth/session. We do a CHEAP cookie-presence
// check here (full Firebase verification happens server-side via
// getSessionUser() in the actual route handlers).
//
// Doing full Admin SDK verification in middleware would force the Edge runtime
// to bundle firebase-admin which doesn't run on Edge. The two-step check
// (presence here, signature there) is the standard pattern.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "jobscout_session";

const PUBLIC_PATHS: ReadonlyArray<string | RegExp> = [
  "/",
  "/pricing",
  "/terms",
  "/privacy",
  "/security",
  "/status",
  "/signin",
  "/signup",
  "/manifest.webmanifest",
  "/sw.js",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  /^\/icon-/,
  /^\/_next\//,
  /^\/api\/auth\//,
  /^\/api\/cron\//,                  // token-guarded server-side
  /^\/api\/digest\/unsubscribe/,
  /^\/api\/oauth\/linkedin\//,
  /^\/api\/waitlist/,
  /^\/api\/upwork\//,                // bearer-token-guarded server-side (extension)
  /^\/api\/stripe\/webhook/,         // signature-verified; Stripe POSTs without cookies + doesn't follow redirects
  /^\/api\/feedback/,                // anon-friendly bug/feedback submit (FloatingOverlay)
  /^\/api\/support-chat/,            // anon-friendly Claude support chat (FloatingOverlay)
  /^\/api\/analytics\//,             // anon page-view + custom-event capture (no PII)
  /^\/api\/errors/,                  // anon-friendly client-error sink (ClientErrorReporter + global-error)
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((m) =>
    typeof m === "string" ? m === pathname : m.test(pathname),
  );
}

export function middleware(req: NextRequest) {
  // Auth not configured? Don't gate — keeps deploys without Firebase Auth keys
  // working in demo mode.
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const session = req.cookies.get(SESSION_COOKIE);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Skip _next/static & _next/image automatically; everything else flows through.
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
