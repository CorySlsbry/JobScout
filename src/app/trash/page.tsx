// /trash — every job the user has hidden from their feed. One-click restore.
//
// We don't store a full hidden_at timestamp (yet) — just the job_id list on
// profile.hidden_job_ids. To render, we look up each job doc by id and skip
// any that have since been purged from the shared pool.

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2, RotateCcw } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getProfile } from "@/lib/db";
import { getDb, COL } from "@/lib/firestore";
import { restoreJobAction } from "@/app/actions";
import type { Job } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobScout · Trash" };

async function loadHiddenJobs(uid: string): Promise<Job[]> {
  const profile = await getProfile(uid);
  const ids = profile.hidden_job_ids ?? [];
  if (ids.length === 0) return [];
  const db = getDb();
  if (!db) return [];
  // Firestore "in" supports 30 ids per query — chunk it.
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
  const results: Job[] = [];
  for (const chunk of chunks) {
    try {
      const snap = await db.collection(COL.jobs)
        .where("__name__", "in", chunk.map((id) => db.collection(COL.jobs).doc(id)))
        .get();
      results.push(...snap.docs.map((d) => d.data() as Job));
    } catch {
      // Fall back to per-id reads if "in" query fails
      for (const id of chunk) {
        try {
          const snap = await db.collection(COL.jobs).doc(id).get();
          if (snap.exists) results.push(snap.data() as Job);
        } catch {/* skip */}
      }
    }
  }
  // Sort newest discovered first
  results.sort((a, b) => (b.discovered_at ?? "").localeCompare(a.discovered_at ?? ""));
  return results;
}

export default async function TrashPage() {
  const session = await getSessionUser();
  if (!session) redirect("/signin?from=/trash");

  const jobs = await loadHiddenJobs(session.uid);

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pb-28">
      <header className="pt-5 flex items-center gap-3">
        <Link href="/feed" className="rounded-full p-1.5 hover:bg-[var(--bg-elev)] text-[var(--muted)] hover:text-[var(--fg)]" aria-label="Back">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Trash</p>
          <h1 className="font-[family-name:var(--font-inter-tight)] mt-0.5 text-2xl sm:text-3xl font-bold tracking-tight">
            {jobs.length === 0 ? "Nothing hidden" : `${jobs.length} hidden job${jobs.length === 1 ? "" : "s"}`}
          </h1>
        </div>
      </header>

      {jobs.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--muted)]">
          Hidden jobs land here. Use the <strong className="text-[var(--fg)]">Remove from feed</strong> button on any job&apos;s detail page to send it here. The underlying job doc stays in the shared pool — restoring brings it back to your feed instantly.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {jobs.map((job) => (
            <li key={job.id} className="glass rounded-2xl p-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/jobs/${encodeURIComponent(job.id)}`} className="font-semibold leading-tight line-clamp-2 hover:text-[var(--accent-2)]">
                  {job.title}
                </Link>
                <p className="mt-1 text-xs text-[var(--muted)] truncate">
                  {job.company ?? "Unknown company"}
                  {job.location && ` · ${job.location}`}
                </p>
                <p className="mt-1 text-[11px] text-[var(--muted)] inline-flex items-center gap-1">
                  <Trash2 size={10} /> Hidden — not in your feed
                </p>
              </div>
              <form action={restoreJobAction}>
                <input type="hidden" name="job_id" value={job.id} />
                <button
                  type="submit"
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1.5 text-xs font-semibold hover:border-[var(--accent-2)] hover:text-[var(--accent-2)]"
                >
                  <RotateCcw size={12} /> Restore
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
