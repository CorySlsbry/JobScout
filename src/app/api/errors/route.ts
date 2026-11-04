// POST /api/errors — sink for client-side error reports.
//
// Called by:
//   • components/ClientErrorReporter (window error + unhandledrejection)
//   • app/global-error.tsx (React render errors)
//
// Anon-friendly (no session required) — visitors can hit JS errors too.
// Rate limited to 30/min/IP so a runaway client-side bug can't blow up
// Firestore writes. Server-side errors come through the instrumentation
// hook, not this endpoint.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { captureError } from "@/lib/error-monitoring";
import { applyRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (applyRateLimit("errors", clientIp(req), { capacity: 30, refillPerMin: 30 })) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }); }
  const b = body as { name?: unknown; message?: unknown; stack?: unknown; path?: unknown; source?: unknown; context?: unknown };

  const name = typeof b.name === "string" ? b.name.slice(0, 80) : "Error";
  const message = typeof b.message === "string" ? b.message.slice(0, 2000) : "(no message)";
  const stack = typeof b.stack === "string" ? b.stack : null;
  const path = typeof b.path === "string" ? b.path.slice(0, 500) : null;
  const ctx = (b.context && typeof b.context === "object" && !Array.isArray(b.context))
    ? (b.context as Record<string, unknown>)
    : null;

  // Reconstruct an Error-ish object so captureError can normalize it.
  const errLike = Object.assign(new Error(message), { name, stack: stack ?? undefined });

  const session = await getSessionUser().catch(() => null);
  await captureError(errLike, {
    source: "client",
    path,
    user_id: session?.uid ?? null,
    user_email: session?.email ?? null,
    user_agent: req.headers.get("user-agent"),
    context: ctx,
  });

  return NextResponse.json({ ok: true });
}
