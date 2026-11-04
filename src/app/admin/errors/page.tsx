// /admin/errors — grouped runtime errors (Sentry-grade view).
//
// Errors auto-group by hash(name + normalized message + first stack frame).
// Each group shows count, source(s), affected users, latest stack.

import { listErrorGroups } from "@/lib/error-monitoring";
import { AlertOctagon, Bug, Server, MousePointer, User } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobScout · Admin · Errors" };

function sourceIcon(source: string) {
  if (source === "server") return <Server size={11} className="text-[var(--accent-2)]" />;
  if (source === "client") return <MousePointer size={11} className="text-[var(--accent)]" />;
  return <Bug size={11} className="text-[var(--warn)]" />;
}

function relTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function AdminErrorsPage() {
  const groups = await listErrorGroups(500);

  return (
    <div>
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Errors</p>
          <h1 className="font-[family-name:var(--font-inter-tight)] mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
            {groups.length === 0 ? "All clear" : `${groups.length} error group${groups.length === 1 ? "" : "s"}`}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            In-house error capture — server + client + user-reported. Identical errors collapse to one group via a 12-char hash.
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="mt-8 glass rounded-2xl p-8 text-center">
          <AlertOctagon size={32} className="mx-auto text-[var(--good)] opacity-60" />
          <p className="mt-3 text-sm text-[var(--muted)]">
            No errors captured yet. Server crashes hit via instrumentation.onRequestError. Client errors via the window error listener. User-reported via the Bug button.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {groups.map((g) => (
            <details key={g.group_key} className="glass rounded-2xl group">
              <summary className="cursor-pointer list-none p-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    <code className="font-mono">{g.group_key}</code>
                    {g.sources.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-elev-2)] px-1.5 py-0.5 normal-case tracking-normal">
                        {sourceIcon(s)} {s}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 font-semibold leading-snug">
                    <code className="text-[var(--bad)]">{g.latest.name}:</code> <span className="text-[var(--fg)]">{g.latest.message}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
                    <span><strong className="text-[var(--fg)] tabular-nums">{g.count}</strong> occurrence{g.count === 1 ? "" : "s"}</span>
                    <span className="inline-flex items-center gap-1"><User size={11} /> <strong className="text-[var(--fg)] tabular-nums">{g.affected_users}</strong> users</span>
                    <span>last seen {relTime(g.latest.created_at)}</span>
                    {g.latest.path && <span className="font-mono text-[10px] truncate max-w-[20rem]" title={g.latest.path}>{g.latest.path}</span>}
                    {g.latest.integration && <span className="rounded bg-[var(--accent-2-soft)] text-[var(--accent-2)] px-1.5 py-0.5 text-[10px] uppercase">{g.latest.integration}</span>}
                  </div>
                </div>
                <span className="text-[var(--muted)] mt-1 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <div className="px-4 pb-4 -mt-2 space-y-3">
                {g.latest.stack && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">Latest stack</p>
                    <pre className="text-[10px] leading-[1.4] font-mono bg-[var(--bg-elev-2)] rounded-lg p-3 overflow-x-auto max-h-64 whitespace-pre-wrap break-all border border-[var(--border)]">{g.latest.stack}</pre>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-[var(--muted)]">User</p>
                    <p className="text-[var(--fg)] truncate">{g.latest.user_email || g.latest.user_id || <em className="text-[var(--muted)]">anonymous</em>}</p>
                  </div>
                  <div>
                    <p className="text-[var(--muted)]">Release</p>
                    <p className="font-mono text-[var(--fg)] truncate">{g.latest.release ?? <em className="text-[var(--muted)]">unknown</em>}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[var(--muted)]">User agent</p>
                    <p className="text-[var(--fg)] text-[11px] truncate" title={g.latest.user_agent ?? ""}>{g.latest.user_agent ?? "—"}</p>
                  </div>
                  {g.latest.context && (
                    <div className="col-span-2">
                      <p className="text-[var(--muted)]">Context</p>
                      <pre className="text-[10px] font-mono bg-[var(--bg-elev-2)] rounded p-2 overflow-x-auto max-h-32 border border-[var(--border)]">{JSON.stringify(g.latest.context, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
