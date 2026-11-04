import Link from "next/link";
import { redirect } from "next/navigation";
import { listJobs } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { JobCard } from "@/components/JobCard";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

const STATUSES = ["saved", "queued", "applied", "followed_up", "interview", "offer", "rejected"] as const;

export default async function SavedPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/signin");
  const all = await listJobs(sessionUser.uid);
  const tracked = all.filter((j) => j.application && j.application.status !== "dismissed");

  const buckets = STATUSES.map((s) => ({
    key: s,
    label: s.replace(/_/g, " "),
    jobs: tracked.filter((j) => j.application?.status === s),
  })).filter((b) => b.jobs.length > 0);

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-28">
      <header className="mb-5 flex items-center justify-between">
        <Logo size="md" />
        <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--fg)]">← Home</Link>
      </header>
      <h1 className="font-[family-name:var(--font-inter-tight)] text-2xl font-bold tracking-tight">Pipeline</h1>
      <p className="text-sm text-[var(--muted)]">Saved jobs, applications, and follow-ups.</p>

      {tracked.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-[var(--muted)]">
          Nothing saved yet. Tap any job in the feed and hit <strong className="text-[var(--fg)]">Save</strong>.
        </div>
      )}

      <div className="mt-6 space-y-6 pb-8">
        {buckets.map((b) => (
          <section key={b.key}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">
              {b.label} <span className="text-[var(--muted)] font-medium">· {b.jobs.length}</span>
            </h2>
            <ul className="space-y-3">
              {b.jobs.map((j) => (
                <li key={j.id}>
                  <JobCard job={j} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
