import Link from "next/link";
import { redirect } from "next/navigation";
import { listJobs, getStats } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import type { ApplicationStatus, JobWithApplication } from "@/lib/types";

export const dynamic = "force-dynamic";

const FUNNEL_STAGES: Array<{ key: ApplicationStatus | "tracked"; label: string }> = [
  { key: "tracked",      label: "Tracked" },
  { key: "applied",      label: "Applied" },
  { key: "followed_up",  label: "Followed up" },
  { key: "interview",    label: "Interview" },
  { key: "offer",        label: "Offer" },
];

export default async function DashboardPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/signin");
  // Single listJobs + derive stats from the same array — was duplicating
  // a 500-doc Firestore read + 500x scoreJob() pass (same fix as /feed).
  const jobs = await listJobs(sessionUser.uid);
  const stats = await getStats(sessionUser.uid, jobs);
  const tracked = jobs.filter((j) => j.application && j.application.status !== "dismissed");

  // ── Funnel counts ─────────────────────────────────────────────
  const counts: Record<string, number> = {
    tracked:     tracked.length,
    applied:     tracked.filter((j) => ["applied","followed_up","interview","offer"].includes(j.application!.status)).length,
    followed_up: tracked.filter((j) => ["followed_up","interview","offer"].includes(j.application!.status)).length,
    interview:   tracked.filter((j) => ["interview","offer"].includes(j.application!.status)).length,
    offer:       tracked.filter((j) => j.application!.status === "offer").length,
  };
  const conversion = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

  // ── By source: applies + interview rate ───────────────────────
  type SourceRow = { source: string; jobs: number; applied: number; interviews: number };
  const bySrc: Record<string, SourceRow> = {};
  for (const j of jobs) {
    bySrc[j.source] ??= { source: j.source, jobs: 0, applied: 0, interviews: 0 };
    bySrc[j.source].jobs++;
    if (j.application && ["applied","followed_up","interview","offer"].includes(j.application.status)) {
      bySrc[j.source].applied++;
    }
    if (j.application && ["interview","offer"].includes(j.application.status)) {
      bySrc[j.source].interviews++;
    }
  }
  const sourceRows = Object.values(bySrc).sort((a, b) => b.jobs - a.jobs);

  // ── Time-to-action (created → applied) ────────────────────────
  const timesHrs = tracked
    .filter((j) => j.application?.applied_at)
    .map((j) => {
      const t0 = new Date(j.discovered_at).getTime();
      const t1 = new Date(j.application!.applied_at!).getTime();
      return (t1 - t0) / (1000 * 60 * 60);
    })
    .filter((h) => h >= 0);
  const medianTimeHrs = median(timesHrs);

  // ── Match-rate stats ──────────────────────────────────────────
  const withSalary = jobs.filter((j) => j.salary_max);
  const remoteJobs = withSalary.filter((j) => j.is_remote);
  const stGeorgeJobs = withSalary.filter((j) => (j.location ?? "").toLowerCase().includes("george"));
  const slcJobs = withSalary.filter((j) => /salt lake|slc|lehi|provo|orem/i.test(j.location ?? ""));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-5 pb-28 space-y-6">
      <header className="flex items-center justify-between">
        <Logo size="md" />
        <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--fg)]">← Home</Link>
      </header>
      <div>
        <h1 className="font-[family-name:var(--font-inter-tight)] text-2xl sm:text-3xl font-bold tracking-tight">Trends &amp; Performance</h1>
        <p className="text-sm text-[var(--muted)]">Your application pipeline, conversion rates, and where the money is.</p>
      </div>

      {/* ── KPIs ─────────────────────────────────────────── */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <BigStat label="Total jobs"     value={String(stats.total)} />
        <BigStat label="Avg max salary" value={stats.avgSalaryMax ? `$${(stats.avgSalaryMax/1000).toFixed(0)}k` : "—"} tone="good" />
        <BigStat label="Applied"        value={String(counts.applied)} tone="accent" />
        <BigStat label="Interview rate" value={counts.applied ? `${conversion(counts.interview, counts.applied)}%` : "—"} tone="violet" />
      </section>

      {/* ── Application funnel ──────────────────────────── */}
      <section className="glass rounded-2xl p-4 sm:p-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Application funnel</h2>
        <div className="mt-4 space-y-2.5">
          {FUNNEL_STAGES.map((stage, i) => {
            const n = counts[stage.key] ?? 0;
            const pct = counts.tracked > 0 ? Math.round((n / counts.tracked) * 100) : 0;
            const drop = i > 0 ? (counts[FUNNEL_STAGES[i-1].key] ?? 0) - n : null;
            return (
              <FunnelBar key={stage.key} label={stage.label} n={n} pct={pct} drop={drop} />
            );
          })}
        </div>
        {counts.tracked > 0 && (
          <p className="mt-4 text-xs text-[var(--muted)]">
            Overall: <strong className="text-[var(--fg)]">{counts.applied}</strong> applied →
            <strong className="text-[var(--fg)]"> {counts.interview}</strong> interviews
            {counts.offer > 0 && <> → <strong className="text-[var(--good)]">{counts.offer}</strong> offer{counts.offer === 1 ? "" : "s"}</>}.
            {medianTimeHrs != null && counts.applied > 0 && (
              <> Median time-to-apply: <strong className="text-[var(--fg)]">{formatDuration(medianTimeHrs)}</strong>.</>
            )}
          </p>
        )}
      </section>

      {/* ── By source ───────────────────────────────────── */}
      <section className="glass rounded-2xl p-4 sm:p-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Which boards convert best</h2>
        <div className="mt-4 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)]">
                <th className="pb-2 font-medium">Source</th>
                <th className="pb-2 font-medium text-right">Jobs</th>
                <th className="pb-2 font-medium text-right">Applied</th>
                <th className="pb-2 font-medium text-right">Interviews</th>
                <th className="pb-2 font-medium text-right">Apply→Int</th>
              </tr>
            </thead>
            <tbody>
              {sourceRows.length === 0 && (
                <tr><td colSpan={5} className="py-3 text-center text-[var(--muted)]">No jobs yet.</td></tr>
              )}
              {sourceRows.map((r) => {
                const rate = r.applied > 0 ? Math.round((r.interviews / r.applied) * 100) : null;
                return (
                  <tr key={r.source} className="border-t border-[var(--border)]">
                    <td className="py-2.5 font-medium">{labelSource(r.source)}</td>
                    <td className="py-2.5 text-right">{r.jobs}</td>
                    <td className="py-2.5 text-right">{r.applied}</td>
                    <td className="py-2.5 text-right">{r.interviews}</td>
                    <td className="py-2.5 text-right">
                      {rate != null ? <span className="font-semibold text-[var(--good)]">{rate}%</span> : <span className="text-[var(--muted)]">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Median salary by location ───────────────────── */}
      <section className="glass rounded-2xl p-4 sm:p-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Median max salary by location</h2>
        <ul className="mt-4 space-y-3 text-sm">
          <Bar label="Remote"            jobs={remoteJobs.length}    median={median(remoteJobs.map((j) => j.salary_max!))} tone="good" />
          <Bar label="St George"         jobs={stGeorgeJobs.length}  median={median(stGeorgeJobs.map((j) => j.salary_max!))} tone="accent" />
          <Bar label="SLC / Utah Cnty"   jobs={slcJobs.length}       median={median(slcJobs.map((j) => j.salary_max!))} tone="violet" />
        </ul>
      </section>

      {/* ── Top titles + stack mentions ─────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TopTitlesCard jobs={jobs} />
        <StackMentionsCard jobs={jobs} />
      </div>
    </div>
  );
}

/* ── helper components ─────────────────────────────────── */

function BigStat({ label, value, tone }: { label: string; value: string; tone?: "good" | "accent" | "violet" }) {
  const c = tone === "good" ? "text-[var(--good)]" :
            tone === "accent" ? "text-[var(--accent)]" :
            tone === "violet" ? "text-[var(--accent-2)]" : "text-[var(--fg)]";
  return (
    <div className="glass rounded-2xl p-4">
      <div className={`font-[family-name:var(--font-inter-tight)] text-2xl font-bold leading-none ${c}`}>{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-widest text-[var(--muted)]">{label}</div>
    </div>
  );
}

function FunnelBar({ label, n, pct, drop }: { label: string; n: number; pct: number; drop: number | null }) {
  return (
    <div>
      <div className="flex items-end justify-between gap-3 text-xs">
        <span className="text-[var(--muted)]">{label}</span>
        <span className="text-[var(--fg)] font-semibold">
          {n} <span className="text-[var(--muted)] font-normal">· {pct}%</span>
          {drop != null && drop > 0 && <span className="ml-2 text-[var(--bad)]">−{drop}</span>}
        </span>
      </div>
      <div className="mt-1 h-2.5 rounded-full bg-[var(--bg-elev-2)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.max(2, pct)}%`,
            background: pct >= 50 ? "linear-gradient(90deg, var(--accent-2), var(--accent))" : "var(--accent-2)",
            boxShadow: pct >= 50 ? "0 0 12px rgba(168,85,247,0.4)" : "none",
          }}
        />
      </div>
    </div>
  );
}

function Bar({ label, jobs, median, tone }: { label: string; jobs: number; median: number | null; tone: "accent" | "violet" | "good" }) {
  const fill = tone === "accent" ? "var(--accent)" : tone === "violet" ? "var(--accent-2)" : "var(--good)";
  const pct = median ? Math.min(100, Math.round((median / 250000) * 100)) : 0;
  return (
    <li>
      <div className="flex justify-between text-xs">
        <span className="text-[var(--muted)]">{label} <span className="opacity-70">· {jobs} jobs</span></span>
        <span className="font-medium text-[var(--fg)]">{median ? `$${(median/1000).toFixed(0)}k` : "—"}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-[var(--bg-elev-2)] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: fill, boxShadow: `0 0 8px ${fill}40` }} />
      </div>
    </li>
  );
}

function TopTitlesCard({ jobs }: { jobs: JobWithApplication[] }) {
  const titleCounts = new Map<string, number>();
  for (const j of jobs) {
    const norm = normalizeTitle(j.title);
    titleCounts.set(norm, (titleCounts.get(norm) ?? 0) + 1);
  }
  const top = [...titleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return (
    <section className="glass rounded-2xl p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Top titles</h2>
      <ul className="mt-3 space-y-1.5 text-sm">
        {top.length === 0 && <li className="text-[var(--muted)]">No jobs yet.</li>}
        {top.map(([title, count]) => (
          <li key={title} className="flex justify-between gap-3">
            <span className="truncate">{title}</span>
            <span className="text-[var(--muted)]">{count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StackMentionsCard({ jobs }: { jobs: JobWithApplication[] }) {
  const STACK = ["typescript","javascript","node","next","react","supabase","postgres","python","n8n","zapier","ghl","apollo","claude","openai","mcp","aws","gcp","docker","kubernetes"];
  const counts = new Map<string, number>();
  for (const j of jobs) {
    const hay = `${j.title} ${j.description ?? ""}`.toLowerCase();
    for (const t of STACK) if (hay.includes(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  return (
    <section className="glass rounded-2xl p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Stack mentions</h2>
      <ul className="mt-3 grid grid-cols-2 gap-1.5 text-sm">
        {top.length === 0 && <li className="text-[var(--muted)] col-span-2">No mentions yet.</li>}
        {top.map(([tech, count]) => (
          <li key={tech} className="flex justify-between gap-2">
            <span>{tech}</span>
            <span className="text-[var(--muted)]">{count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── pure helpers ──────────────────────────────────────── */

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function normalizeTitle(t: string): string {
  return t.replace(/\(.*?\)/g, "").replace(/\s+-\s+.*$/, "").replace(/\s+/g, " ").trim();
}

function formatDuration(hrs: number): string {
  if (hrs < 1) return `${Math.round(hrs * 60)} min`;
  if (hrs < 24) return `${Math.round(hrs)}h`;
  const days = hrs / 24;
  return `${days.toFixed(days < 10 ? 1 : 0)}d`;
}

function labelSource(s: string): string {
  return ({ linkedin: "LinkedIn", indeed: "Indeed", ziprecruiter: "ZipRecruiter", ksl: "KSL", jsearch: "JSearch", google_jobs: "Google", other: "Other" } as Record<string,string>)[s] ?? s;
}
