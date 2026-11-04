// Active-pipeline page — every job the user has actually applied to (or
// moved further along: followed up, interviewing, offered, rejected).
// Pre-application "saved" jobs still live under /saved.

import Link from "next/link";
import { redirect } from "next/navigation";
import { listJobs } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { JobCard } from "@/components/JobCard";
import { Logo } from "@/components/Logo";
import { Send } from "lucide-react";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["applied", "followed_up", "interview", "offer", "rejected"] as const;

const LABEL: Record<typeof ACTIVE_STATUSES[number], string> = {
  applied: "Applied",
  followed_up: "Followed up",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export default async function AppliedPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/signin");
  const all = await listJobs(sessionUser.uid);
  const inFlight = all.filter((j) => j.application && (ACTIVE_STATUSES as readonly string[]).includes(j.application.status));

  const buckets = ACTIVE_STATUSES.map((s) => ({
    key: s,
    label: LABEL[s],
    jobs: inFlight
      .filter((j) => j.application?.status === s)
      .sort((a, b) => (b.application?.applied_at ?? b.application?.updated_at ?? "").localeCompare(a.application?.applied_at ?? a.application?.updated_at ?? "")),
  })).filter((b) => b.jobs.length > 0);

  const total = inFlight.length;

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-28">
      <header className="mb-5 flex items-center justify-between">
        <Logo size="md" />
        <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--fg)]">← Home</Link>
      </header>

      <div className="flex items-center gap-2">
        <span className="rounded-xl p-1.5" style={{ background: "var(--accent-2-soft)", color: "var(--accent-2)" }}>
          <Send size={16} />
        </span>
        <h1 className="font-[family-name:var(--font-inter-tight)] text-2xl font-bold tracking-tight">Applied</h1>
        {total > 0 && (
          <span className="text-xs font-semibold text-[var(--accent-2)] bg-[var(--accent-2-soft)] rounded-full px-2 py-0.5">{total}</span>
        )}
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Jobs you&apos;ve sent a proposal or application to. Tracked here until you move them to <em>interview</em>, <em>offer</em>, or <em>rejected</em>.
      </p>

      {total === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-[var(--muted)]">
          Nothing here yet. The moment you tap <strong className="text-[var(--fg)]">Apply</strong> on a job (in the feed or from the extension), it lands here.
          <p className="mt-3 text-[11px]">
            Looking for jobs you&apos;ve saved but haven&apos;t applied to? See <Link href="/saved" className="underline decoration-[var(--accent-2)]/40 hover:decoration-[var(--accent-2)]">Pipeline</Link>.
          </p>
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
