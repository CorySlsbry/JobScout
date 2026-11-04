// POST /api/admin/clear-jobs
// Body: { mode: "feed" | "wipe" }   (default "feed")
//
// "feed" — clears the cluttered feed: deletes jobs that have NO application
//          OR whose application is in {"saved", "dismissed"}. Keeps any job
//          you've actually applied to or moved further along (followed_up,
//          interview, offer, rejected). Pre-application "saved" jobs and
//          dismissed jobs are noise; the rest is your pipeline.
//
// "wipe" — destructive: deletes ALL jobs, ALL applications, ALL upwork_leads.
//          Profile + resumes + assessments + calibration are untouched.
//
// Admin session only. Both modes also wipe upwork_leads (those are derived
// from emails and the next inbox-watcher run regenerates anything that
// still matters).

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getDb, COL } from "@/lib/firestore";
import { getStore } from "@/lib/seed";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ mode: z.enum(["feed", "wipe"]).optional() });

const PIPELINE_STATUSES = ["applied", "followed_up", "interview", "offer", "rejected"] as const;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !user.is_admin) {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json().catch(() => ({}))); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }
  const mode = body.mode ?? "feed";

  const db = getDb();
  let jobsDeleted = 0, appsDeleted = 0, leadsDeleted = 0, jobsKept = 0;

  if (db) {
    // Build the keep-set of job ids (jobs with active pipeline applications).
    const appSnap = await db.collection(COL.applications).get();
    const keepJobIds = new Set<string>();
    const allApps: Array<{ jobId: string; status: string }> = [];
    for (const d of appSnap.docs) {
      const data = d.data() as { job_id?: string; status?: string };
      const jobId = data.job_id ?? d.id;
      const status = data.status ?? "";
      allApps.push({ jobId, status });
      if (mode === "feed" && (PIPELINE_STATUSES as readonly string[]).includes(status)) {
        keepJobIds.add(jobId);
      }
    }

    // Delete jobs.
    const jobsSnap = await db.collection(COL.jobs).get();
    for (const d of jobsSnap.docs) {
      if (mode === "feed" && keepJobIds.has(d.id)) { jobsKept++; continue; }
      await d.ref.delete();
      jobsDeleted++;
    }

    // Delete applications.
    for (const d of appSnap.docs) {
      const data = d.data() as { job_id?: string; status?: string };
      const status = data.status ?? "";
      const jobId = data.job_id ?? d.id;
      if (mode === "feed" && (PIPELINE_STATUSES as readonly string[]).includes(status) && keepJobIds.has(jobId)) continue;
      await d.ref.delete();
      appsDeleted++;
    }

    // Always clear upwork_leads — they're derived from emails.
    const leadsSnap = await db.collection(COL.upworkLeads).get();
    for (const d of leadsSnap.docs) {
      await d.ref.delete();
      leadsDeleted++;
    }
  } else {
    // In-memory store fallback (dev).
    const store = getStore();
    const keepIds = new Set<string>();
    if (mode === "feed") {
      for (const a of store.applications) {
        if ((PIPELINE_STATUSES as readonly string[]).includes(a.status)) keepIds.add(a.job_id);
      }
    }
    const beforeJobs = store.jobs.length;
    store.jobs = mode === "feed" ? store.jobs.filter((j) => keepIds.has(j.id)) : [];
    jobsDeleted = beforeJobs - store.jobs.length;
    jobsKept = store.jobs.length;

    const beforeApps = store.applications.length;
    store.applications = mode === "feed"
      ? store.applications.filter((a) => keepIds.has(a.job_id) && (PIPELINE_STATUSES as readonly string[]).includes(a.status))
      : [];
    appsDeleted = beforeApps - store.applications.length;

    const beforeLeads = (store.upworkLeads ?? []).length;
    store.upworkLeads = [];
    leadsDeleted = beforeLeads;
  }

  revalidatePath("/feed");
  revalidatePath("/applied");
  revalidatePath("/saved");
  revalidatePath("/upwork-leads");
  revalidatePath("/dashboard");

  return NextResponse.json({ ok: true, mode, jobsDeleted, jobsKept, appsDeleted, leadsDeleted });
}
