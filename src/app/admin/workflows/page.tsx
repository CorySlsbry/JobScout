// /admin/workflows — catalog of every email/SMS/in-app workflow.
//
// Each row is sourced from WORKFLOW_CATALOG (lib/workflows.ts). The "live"
// flag distinguishes shipped vs planned, so this page is always an honest
// reflection of what fires automatically vs what's still on the roadmap.

import { WORKFLOW_CATALOG } from "@/lib/workflows";
import { Activity, Mail, Calendar, Zap, Sparkles } from "lucide-react";
import { getDb, COL } from "@/lib/firestore";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobScout · Admin · Workflows" };

type WorkflowRun = {
  kind: string;
  workflow_id: string;
  uid: string;
  status: string;
  note: string | null;
  created_at: string;
};

async function recentRuns(): Promise<WorkflowRun[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const snap = await db.collection(COL.searchRuns).orderBy("created_at", "desc").limit(50).get();
    return snap.docs
      .map((d) => d.data() as WorkflowRun)
      .filter((r) => r.kind === "workflow");
  } catch { return []; }
}

export default async function AdminWorkflowsPage() {
  const runs = await recentRuns();
  const live = WORKFLOW_CATALOG.filter((w) => w.status === "live").length;
  const planned = WORKFLOW_CATALOG.filter((w) => w.status === "planned").length;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Workflows</p>
      <h1 className="font-[family-name:var(--font-inter-tight)] mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
        Email + in-app sequences
      </h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {live} live · {planned} planned. Live entries fire on real events; planned entries are the roadmap.
      </p>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {WORKFLOW_CATALOG.map((w) => (
          <div key={w.id} className="glass rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <TriggerIcon trigger={w.trigger} />
                <h3 className="font-semibold">{w.name}</h3>
              </div>
              <StatusPill status={w.status} />
            </div>
            <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">{w.description}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <Field label="Trigger" value={w.trigger} />
              <Field label="Cadence" value={w.cadence} />
              <Field label="Id" value={<code className="font-mono">{w.id}</code>} />
            </dl>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">Recent workflow runs (last 50)</h3>
        <div className="mt-3 glass rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted)] text-left">
                <th className="p-3 font-medium">When</th>
                <th className="p-3 font-medium">Workflow</th>
                <th className="p-3 font-medium">User</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-[var(--muted)]">No workflow fires logged yet. Welcome email fires on signup; check back after your first sign-up.</td></tr>
              )}
              {runs.map((r, i) => (
                <tr key={i} className="border-b border-[var(--border)]/40 last:border-0">
                  <td className="p-3 text-xs tabular-nums whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-3 text-xs"><code className="font-mono">{r.workflow_id}</code></td>
                  <td className="p-3 text-xs text-[var(--muted)] truncate max-w-[120px]" title={r.uid}>{r.uid.slice(0, 12)}…</td>
                  <td className="p-3 text-xs">{r.status}</td>
                  <td className="p-3 text-xs text-[var(--muted)] truncate max-w-xs">{r.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] p-2">
      <dt className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 truncate">{value}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: "live" | "planned" }) {
  if (status === "live") {
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[var(--good-soft)] text-[var(--good)]">Live</span>;
  }
  return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[var(--bg-elev-2)] text-[var(--muted)]">Planned</span>;
}

function TriggerIcon({ trigger }: { trigger: string }) {
  const cls = "text-[var(--accent-2)]";
  switch (trigger) {
    case "on_signup":        return <Sparkles size={14} className={cls} />;
    case "on_onboard":       return <Sparkles size={14} className={cls} />;
    case "on_match":         return <Zap size={14} className={cls} />;
    case "on_billing_event": return <Activity size={14} className={cls} />;
    case "scheduled":        return <Calendar size={14} className={cls} />;
    case "manual":           return <Mail size={14} className={cls} />;
    default:                 return <Activity size={14} className={cls} />;
  }
}
