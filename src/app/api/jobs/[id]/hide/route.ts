// POST /api/jobs/[id]/hide — hard-hide a job from the user's feed.
//
// We don't delete the underlying shared Job doc (other users may still want
// to see it). Instead we add the job_id to profile.hidden_job_ids. listJobs
// filters those out per user. To restore, see /api/jobs/[id]/restore.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getProfile, updateProfile } from "@/lib/db";
import { applyRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hard cap on hidden_job_ids array — Firestore doc max is 1MB, and a string-id
// list of ~5000 entries leaves plenty of headroom for everything else on
// the profile doc. When the cap is hit we evict the OLDEST entry (FIFO).
const MAX_HIDDEN = 5000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Rate limit: 60/min/IP — generous enough for legit bulk-click but stops a
  // logged-in attacker from bloating the profile doc via flood writes.
  if (applyRateLimit("job-hide", clientIp(req), { capacity: 60, refillPerMin: 60 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const profile = await getProfile(session.uid);
  const current = profile.hidden_job_ids ?? [];
  if (current.includes(id)) {
    return NextResponse.json({ ok: true, already_hidden: true, hidden_count: current.length });
  }
  let next = [...current, id];
  // FIFO eviction past the cap.
  if (next.length > MAX_HIDDEN) next = next.slice(-MAX_HIDDEN);
  await updateProfile(session.uid, { hidden_job_ids: next });
  return NextResponse.json({ ok: true, hidden_count: next.length, evicted: current.length + 1 > MAX_HIDDEN });
}
