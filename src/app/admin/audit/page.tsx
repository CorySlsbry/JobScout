// /admin/audit — append-only audit trail of admin actions + user-data mutations.
// Backs the "who did what when" enterprise question without trawling Cloud Logs.

import { listAuditEntries, type AuditEntry } from "@/lib/audit-log";
import { ShieldCheck, FileLock2, User, ServerCog, CreditCard, Bot } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobScout · Admin · Audit log" };

const ACTOR_ICON: Record<AuditEntry["actor_kind"], React.ReactNode> = {
  admin:  <ShieldCheck size={12} className="text-[var(--accent-2)]" />,
  user:   <User size={12} className="text-[var(--muted)]" />,
  system: <ServerCog size={12} className="text-[var(--muted)]" />,
  stripe: <CreditCard size={12} className="text-[var(--good)]" />,
  cron:   <Bot size={12} className="text-[var(--muted)]" />,
};

export default async function AdminAuditPage() {
  const entries = await listAuditEntries(500);

  return (
    <div>
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Audit log</p>
          <h1 className="font-[family-name:var(--font-inter-tight)] mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
            Who changed what
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Append-only record of admin actions + user-data mutations. Used for security review + GDPR access requests.
          </p>
        </div>
        <p className="text-xs text-[var(--muted)]">{entries.length.toLocaleString()} entries (newest 500)</p>
      </div>

      {entries.length === 0 ? (
        <div className="mt-8 glass rounded-2xl p-8 text-center">
          <FileLock2 size={32} className="mx-auto text-[var(--muted)] opacity-50" />
          <p className="mt-3 text-sm text-[var(--muted)]">
            No audit entries yet. They appear here automatically the next time someone deletes their account, the migration endpoint fires, Stripe completes a checkout, or any other instrumented action runs.
          </p>
        </div>
      ) : (
        <div className="mt-6 glass rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="text-[var(--muted)] border-b border-[var(--border)]">
                <th className="text-left p-3 font-medium">When</th>
                <th className="text-left p-3 font-medium">Action</th>
                <th className="text-left p-3 font-medium">Actor</th>
                <th className="text-left p-3 font-medium">Target</th>
                <th className="text-left p-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-[var(--border)]/30 last:border-0 hover:bg-[var(--bg-elev-2)]/30 align-top">
                  <td className="p-3 text-xs text-[var(--muted)] whitespace-nowrap">
                    <div>{new Date(e.created_at).toLocaleDateString()}</div>
                    <div className="tabular-nums">{new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
                  </td>
                  <td className="p-3">
                    <code className="font-mono text-xs">{e.action}</code>
                  </td>
                  <td className="p-3 text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      {ACTOR_ICON[e.actor_kind]}
                      <span className="text-[var(--fg)]">{e.actor_kind}</span>
                    </span>
                    {e.actor_email && <div className="text-[10px] text-[var(--muted)] truncate max-w-[12rem]" title={e.actor_email}>{e.actor_email}</div>}
                  </td>
                  <td className="p-3 text-xs">
                    {e.target_user_id && (
                      <div className="font-mono text-[10px] text-[var(--muted)] truncate max-w-[10rem]" title={e.target_user_id}>
                        user: {e.target_user_id.slice(0, 12)}…
                      </div>
                    )}
                    {e.target_resource && (
                      <div className="text-[10px] text-[var(--muted)] truncate max-w-[12rem]" title={e.target_resource}>
                        {e.target_resource}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-xs text-[var(--muted)]">{e.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
