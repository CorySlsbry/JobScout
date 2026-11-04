// GET /api/cron/autopilot?token=$CRON_TOKEN
//
// Runs Auto-Pilot for every enabled Pro+ user: generates a tailored resume +
// cover letter for new high-match jobs and stages them as "ready to apply"
// (Application status='queued', auto_prepared=true).
//
// Budget-bounded (5 jobs/user/run) + circuit-breaker aware (skips entirely if
// the Anthropic breaker is open). Designed to run a few times a day, not hourly,
// to keep the Claude bill predictable.

import { NextResponse } from "next/server";
import { runAutopilotAll } from "@/lib/autopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_TOKEN || url.searchParams.get("token") !== process.env.CRON_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const out = await runAutopilotAll();
  const totalPrepared = out.results.reduce((a, b) => a + b.prepared, 0);
  return NextResponse.json({
    ok: true,
    ran: out.ran,
    reason: out.reason ?? null,
    users: out.results.length,
    total_prepared: totalPrepared,
    results: out.results,
  });
}
