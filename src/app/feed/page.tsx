import Link from "next/link";
import { redirect } from "next/navigation";
import { listJobs, getStats, getProfile } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { JobCard } from "@/components/JobCard";
import FilterBar from "@/components/FilterBar";
import { Logo } from "@/components/Logo";
import type { ApplicationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string; remote?: string; stgeorge?: string;
  min?: string; source?: string; status?: string;
};

export default async function FeedPage(props: { searchParams: Promise<SearchParams> }) {
  const sp = await props.searchParams;
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/signin");

  // listJobs internally loads the user profile + applies all per-user filters
  // + re-scores against the user profile. Compute stats from the same result
  // instead of re-running the whole pipeline (was costing a duplicate 500-doc
  // Firestore read + 500x scoreJob() pass — ~5s steady state on prod). We
  // still load profile separately for the welcome-back / settings hint.
  const [jobs, profile] = await Promise.all([
    listJobs(sessionUser.uid, {
      q: sp.q,
      remoteOnly: sp.remote === "1",
      stGeorgeOnly: sp.stgeorge === "1",
      minScore: sp.min ? Number(sp.min) : undefined,
      source: sp.source,
      status: sp.status as ApplicationStatus | "unapplied" | "all" | undefined,
    }),
    getProfile(sessionUser.uid),
  ]);
  const stats = await getStats(sessionUser.uid, jobs);

  // Clean-slate detection: a brand-new user who hasn't added a resume OR any
  // search config is seeing the shared discovery pool scored against an empty
  // profile — that's not "their" matched jobs yet. Surface a setup prompt so
  // it never reads as inherited data.
  const needsSetup =
    !profile.resume_md?.trim() &&
    !(profile.search_queries?.length) &&
    !(profile.target_titles?.length) &&
    !(profile.keyword_include?.length);

  return (
    <div className="pb-28">
      <header className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-5">
        <div className="flex items-center justify-between">
          <Logo size="md" />
          <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--fg)]">← Home</Link>
        </div>
        <p className="mt-4 text-sm text-[var(--muted)]">Welcome back, {(profile.full_name || sessionUser.name || "").split(" ")[0] || "friend"}.</p>
        <h1 className="font-[family-name:var(--font-inter-tight)] mt-0.5 text-2xl sm:text-3xl font-bold tracking-tight">
          {needsSetup ? "Let's set up your search" : `${jobs.length} matched job${jobs.length === 1 ? "" : "s"}`}
        </h1>
        {!needsSetup && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs sm:max-w-md">
            <Stat n={stats.total}     label="total" />
            <Stat n={stats.highMatch} label="≥70 match" tone="violet" />
            <Stat n={stats.applied}   label="applied" tone="accent" />
          </div>
        )}
      </header>

      {needsSetup && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
          <div className="glass rounded-2xl p-5 border border-[var(--accent-2)]/30">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Get started</p>
            <h2 className="mt-1 font-[family-name:var(--font-inter-tight)] text-lg font-bold tracking-tight">
              The jobs below are a live sample — tune them to you.
            </h2>
            <p className="mt-1.5 text-sm text-[var(--muted)]">
              Add your resume so we can score matches against your real experience, and set your search terms + locations to control exactly what gets pulled. Two minutes in Settings.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/settings" className="btn-cosmic text-sm">Set up my search →</Link>
              <Link href="/settings#resume" className="rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] px-4 py-2 text-sm font-medium hover:border-[var(--accent-2)]">Add my resume</Link>
            </div>
          </div>
        </div>
      )}

      <FilterBar />

      <ul className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-3 pb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {jobs.length === 0 && (
          <li className="col-span-full rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-[var(--muted)]">
            No jobs match these filters yet. Try clearing them or run a sync from{" "}
            <Link href="/settings" className="underline decoration-[var(--accent-2)]/40 hover:decoration-[var(--accent-2)]">Settings</Link>.
          </li>
        )}
        {jobs.map((job) => (
          <li key={job.id}>
            <JobCard job={job} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "accent" | "good" | "violet" }) {
  const c =
    tone === "accent" ? "text-[var(--accent)]" :
    tone === "good"   ? "text-[var(--good)]"   :
    tone === "violet" ? "text-[var(--accent-2)]" :
    "text-[var(--fg)]";
  return (
    <div className="glass rounded-xl py-2.5">
      <div className={`font-[family-name:var(--font-inter-tight)] text-xl font-bold leading-none ${c}`}>{n}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
    </div>
  );
}
