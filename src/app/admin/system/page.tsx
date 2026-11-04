// /admin/system — cron run history + error events + scraper status.
//
// Reads cross-user collections directly via getDb() — these are not user-scoped
// and don't depend on the Phase 1B refactor.

import { getDb, COL } from "@/lib/firestore";
import { Activity, AlertCircle, Clock, ExternalLink } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobScout · Admin · System" };

type SearchRun = {
  id?: string;
  source?: string;
  scanned?: number;
  inserted?: number;
  updated?: number;
  notified?: number;
  errors?: string[] | string | null;
  created_at?: string;
};

async function loadSystem(): Promise<{ runs: SearchRun[]; jobsCount: number; }> {
  const db = getDb();
  if (!db) return { runs: [], jobsCount: 0 };

  let runs: SearchRun[] = [];
  try {
    const snap = await db.collection(COL.searchRuns).orderBy("created_at", "desc").limit(30).get();
    runs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as SearchRun) }));
  } catch {
    // collection may not exist yet
  }

  let jobsCount = 0;
  try {
    const agg = await db.collection(COL.jobs).count().get();
    jobsCount = agg.data().count;
  } catch {
    const snap = await db.collection(COL.jobs).limit(2000).get();
    jobsCount = snap.size;
  }

  return { runs, jobsCount };
}

export default async function AdminSystemPage() {
  const { runs, jobsCount } = await loadSystem();
  const lastRun = runs[0];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">System</p>
      <h1 className="font-[family-name:var(--font-inter-tight)] mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
        Cron + scrapers + job pool
      </h1>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label="Jobs in pool" value={jobsCount.toLocaleString()} sublabel="Shared across all users (v1 architecture)" icon={<Activity />} />
        <Tile label="Last cron run" value={lastRun?.created_at ? new Date(lastRun.created_at).toLocaleString() : "—"} sublabel={lastRun?.source ?? "no runs logged"} icon={<Clock />} />
        <Tile label="Cron runs recorded" value={runs.length.toString()} sublabel="Most recent 30" icon={<Activity />} />
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
          Recent cron runs
        </h3>
        <div className="mt-3 glass rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted)] text-left">
                <th className="p-3 font-medium">When</th>
                <th className="p-3 font-medium">Source</th>
                <th className="p-3 font-medium text-right">Scanned</th>
                <th className="p-3 font-medium text-right">Inserted</th>
                <th className="p-3 font-medium text-right">Updated</th>
                <th className="p-3 font-medium">Errors</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-[var(--muted)]">
                  No cron runs logged. (search_runs collection is empty.)
                </td></tr>
              )}
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)]/40 last:border-0">
                  <td className="p-3 tabular-nums text-xs">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                  <td className="p-3 text-xs">{r.source ?? "—"}</td>
                  <td className="p-3 text-right tabular-nums">{r.scanned ?? 0}</td>
                  <td className="p-3 text-right tabular-nums text-[var(--good)]">{r.inserted ?? 0}</td>
                  <td className="p-3 text-right tabular-nums">{r.updated ?? 0}</td>
                  <td className="p-3 text-xs">
                    {r.errors
                      ? <span className="inline-flex items-center gap-1 text-[var(--bad)]"><AlertCircle size={12} /> {Array.isArray(r.errors) ? r.errors.length : "see logs"}</span>
                      : <span className="text-[var(--muted)]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 glass rounded-2xl p-5">
        <h3 className="font-semibold">Triggers</h3>
        <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
          <li>
            <code className="bg-[var(--bg-elev-2)] rounded px-1.5 py-0.5 text-xs">GET /api/cron/sync?token=…</code>
            — multi-board scrape + score + push
          </li>
          <li>
            <code className="bg-[var(--bg-elev-2)] rounded px-1.5 py-0.5 text-xs">GET /api/cron/digest?token=…</code>
            — daily/weekly email digest
          </li>
          <li>
            <code className="bg-[var(--bg-elev-2)] rounded px-1.5 py-0.5 text-xs">GET /api/cron/upwork-inbox?token=…</code>
            — Gmail watcher pulls new Upwork leads
          </li>
        </ul>
        <Link
          href="https://console.cloud.google.com/run?project=jobscout-app"
          target="_blank" rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-xs text-[var(--accent-2)] hover:underline"
        >
          Open Cloud Run console <ExternalLink size={12} />
        </Link>
      </div>
    </div>
  );
}

function Tile({ label, value, sublabel, icon }: { label: string; value: string; sublabel: string; icon: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between text-[var(--muted)]">
        <span className="text-xs uppercase tracking-wider">{label}</span>
        <span className="opacity-60">{icon}</span>
      </div>
      <p className="mt-2 font-[family-name:var(--font-inter-tight)] text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{sublabel}</p>
    </div>
  );
}
