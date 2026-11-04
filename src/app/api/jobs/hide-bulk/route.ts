// POST /api/jobs/hide-bulk
// Body: { job_ids: string[] }
//
// Bulk-hide. Appends to profile.hidden_job_ids in one write instead of N.
// Idempotent — already-hidden ids are skipped silently.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getProfile, updateProfile } from "@/lib/db";
import { applyRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PER_CALL = 200;   // hard cap on bulk size

export async function POST(req: Request) {
  // Tight rate limit — bulk-hide can be abused to bloat a profile doc.
  if (applyRateLimit("hide-bulk", clientIp(req), { capacity: 5, refillPerMin: 5 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { job_ids?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!Array.isArray(body.job_ids)) {
    return NextResponse.json({ error: "job_ids_required", help: "send { job_ids: [...] }" }, { status: 400 });
  }
  const ids = body.job_ids
    .filter((id): id is string => typeof id === "string" && id.length > 0 && id.length < 200)
    .slice(0, MAX_PER_CALL);
  if (ids.length === 0) return NextResponse.json({ ok: true, added: 0, hidden_count: 0 });

  const profile = await getProfile(session.uid);
  const current = new Set(profile.hidden_job_ids ?? []);
  const before = current.size;
  for (const id of ids) current.add(id);
  const next = Array.from(current);
  if (next.length !== before) {
    await updateProfile(session.uid, { hidden_job_ids: next });
  }
  return NextResponse.json({
    ok: true,
    added: next.length - before,
    hidden_count: next.length,
    capped_at: ids.length === MAX_PER_CALL,
  });
}
