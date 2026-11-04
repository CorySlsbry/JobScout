// POST /api/analytics/event — internal event sink.
//
// Two writes per fire:
//   1) Per-day counter in `usage_counters` (legacy, drives the leaderboard).
//   2) Full event row in `events` (drives funnel, top-pages, top-referrers,
//      recent-stream views on /admin/analytics).
//
// Anonymous-friendly: no session cookie required. Capture session_id and
// referrer_domain from the client (PageViewTracker handles both).

import { NextResponse } from "next/server";
import { getDb, COL } from "@/lib/firestore";
import { getSessionUser } from "@/lib/auth";
import { recordEvent } from "@/lib/events-log";
import { applyRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function eventDocId(name: string): string {
  const day = new Date().toISOString().slice(0, 10);   // YYYY-MM-DD UTC
  return `evt__${day}__${name.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80)}`;
}

export async function POST(req: Request) {
  // Rate limit: high cap (60 events/min) because page_view auto-fires on every nav,
  // but still bounded so an attacker can't flood the events collection.
  if (applyRateLimit("analytics", clientIp(req), { capacity: 60, refillPerMin: 60 })) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }); }
  const b = body as {
    name?: unknown;
    path?: unknown;
    session_id?: unknown;
    referrer_domain?: unknown;
    params?: unknown;
  };
  const name = typeof b.name === "string" ? b.name.slice(0, 80) : null;
  if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });

  const path = typeof b.path === "string" ? b.path.slice(0, 200) : null;
  const session_id = typeof b.session_id === "string" ? b.session_id.slice(0, 80) : null;
  const referrer_domain = typeof b.referrer_domain === "string" ? b.referrer_domain.slice(0, 200) : null;
  const props = (b.params && typeof b.params === "object" && !Array.isArray(b.params))
    ? (b.params as Record<string, string | number | boolean>)
    : null;

  // 1) Per-day counter (legacy)
  const db = getDb();
  if (db) {
    const ref = db.collection(COL.usageCounters).doc(eventDocId(name));
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() as { count?: number } : undefined;
        tx.set(ref, {
          name,
          path,
          date: eventDocId(name).split("__")[1],
          count: (data?.count ?? 0) + 1,
          last_at: new Date().toISOString(),
        }, { merge: true });
      });
    } catch {
      // Don't block on counter blips.
    }
  }

  // 2) Detailed event row (new — drives the in-house analytics dashboard)
  const session = await getSessionUser().catch(() => null);
  await recordEvent({
    name,
    path,
    referrer_domain,
    user_id: session?.uid ?? null,
    session_id,
    user_agent: req.headers.get("user-agent"),
    plan: session?.record?.plan ?? null,
    props,
  });

  return NextResponse.json({ ok: true });
}
