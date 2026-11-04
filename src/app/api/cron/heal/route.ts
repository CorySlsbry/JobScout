// GET /api/cron/heal?token=$CRON_TOKEN
//
// Runs every registered healer. Each writes its own HealEvent row visible
// on /admin/healing. Token-gated like the other cron endpoints.
//
// POST /api/cron/heal?token=...&id=anthropic_circuit_breaker
// Triggers a single healer by id. Used by the /admin/healing "Run now"
// button when proxied through here.

import { NextResponse } from "next/server";
import { runAllHealers, runHealer, ALL_HEALERS } from "@/lib/healers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function checkToken(req: Request): boolean {
  const url = new URL(req.url);
  if (!process.env.CRON_TOKEN || url.searchParams.get("token") !== process.env.CRON_TOKEN) return false;
  return true;
}

export async function GET(req: Request) {
  if (!checkToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const onlyId = url.searchParams.get("id");
  if (onlyId) {
    const r = await runHealer(onlyId, "cron");
    return NextResponse.json(r);
  }
  const results = await runAllHealers("cron");
  return NextResponse.json({
    ok: true,
    healers: ALL_HEALERS.length,
    results,
    acted: results.filter((r) => r.result.acted).length,
    failed: results.filter((r) => !r.result.ok).length,
  });
}
