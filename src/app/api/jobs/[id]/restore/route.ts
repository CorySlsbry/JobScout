// POST /api/jobs/[id]/restore — undo a hide and bring the job back to the feed.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getProfile, updateProfile } from "@/lib/db";
import { applyRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (applyRateLimit("job-restore", clientIp(req), { capacity: 60, refillPerMin: 60 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const profile = await getProfile(session.uid);
  const current = profile.hidden_job_ids ?? [];
  if (!current.includes(id)) {
    return NextResponse.json({ ok: true, already_visible: true, hidden_count: current.length });
  }
  const next = current.filter((x) => x !== id);
  await updateProfile(session.uid, { hidden_job_ids: next });
  return NextResponse.json({ ok: true, hidden_count: next.length });
}
