// /admin/healing — self-healing engine status + history.

import Link from "next/link";
import { ALL_HEALERS, listHealEvents, getAnthropicCircuit } from "@/lib/healers";
import { Heart, Activity, Zap, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobScout · Admin · Self-healing" };

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

export default async function AdminHealingPage() {
  const [events, circuit] = await Promise.all([
    listHealEvents(200),
    getAnthropicCircuit(),
  ]);

  // Map each healer to its most recent event
  const lastByHealer = new Map<string, typeof events[number]>();
  for (const e of events) {
    if (!lastByHealer.has(e.healer_id)) lastByHealer.set(e.healer_id, e);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Self-healing</p>
          <h1 className="font-[family-name:var(--font-inter-tight)] mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
            Auto-recovery engine
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Detectors + fixers that run on a schedule. Each writes a HealEvent row visible below. The Anthropic circuit breaker also runs inline on every request.
          </p>
        </div>
      </div>

      {/* ── Circuit breaker tile ─────────────────────────────────── */}
      <div className="mt-6 glass rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)] flex items-center gap-1.5">
              <Zap size={12} /> Anthropic circuit breaker
            </p>
            <p className="mt-2 font-[family-name:var(--font-inter-tight)] text-xl font-bold">
              {circuit.open
                ? <span className="text-[var(--bad)]">OPEN — calls suspended</span>
                : <span className="text-[var(--good)]">CLOSED — healthy</span>}
            </p>
            {circuit.open && circuit.open_until && (
              <p className="mt-1 text-xs text-[var(--muted)]">Re-tests at {new Date(circuit.open_until).toLocaleString()}</p>
            )}
            {circuit.reason && (
              <p className="mt-1 text-xs text-[var(--muted)]">Reason: {circuit.reason}</p>
            )}
          </div>
          <div className={`rounded-2xl p-3 ${circuit.open ? "bg-[var(--bad-soft)]" : "bg-[var(--good-soft)]"}`}>
            <Heart size={22} className={circuit.open ? "text-[var(--bad)]" : "text-[var(--good)]"} />
          </div>
        </div>
      </div>

      {/* ── Healer registry ─────────────────────────────────────── */}
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
        Registered healers ({ALL_HEALERS.length})
      </h2>
      <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {ALL_HEALERS.map((h) => {
          const last = lastByHealer.get(h.id);
          return (
            <div key={h.id} className="glass rounded-2xl p-4">
              <div className="flex items-start gap-2">
                {last
                  ? (last.ok ? <CheckCircle2 size={18} className="text-[var(--good)] shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="text-[var(--bad)] shrink-0 mt-0.5" />)
                  : <Loader2 size={18} className="text-[var(--muted)] shrink-0 mt-0.5" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{h.label}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--muted)] font-mono">{h.id}</p>
                  <p className="mt-2 text-xs text-[var(--muted)] leading-relaxed">{h.description}</p>
                  <p className="mt-2 text-[11px] text-[var(--muted)]">
                    Cadence: <code className="font-mono text-[10px]">{h.schedule_hint}</code>
                  </p>
                  {last ? (
                    <div className="mt-3 text-xs space-y-1">
                      <p>
                        <span className="text-[var(--muted)]">Last run:</span>{" "}
                        <strong className={last.ok ? "text-[var(--fg)]" : "text-[var(--bad)]"}>{relTime(last.created_at)}</strong>
                        {last.acted && <span className="ml-2 inline-flex rounded-full bg-[var(--accent-2-soft)] text-[var(--accent-2)] px-1.5 py-0.5 text-[10px] font-semibold">ACTED</span>}
                      </p>
                      <p className="text-[var(--muted)] italic">{last.summary}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-[var(--muted)] italic">Never run.</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-[var(--muted)]">
        Trigger: <code className="bg-[var(--bg-elev-2)] rounded px-1 py-0.5 text-[10px]">GET /api/cron/heal?token=…</code>
        {" — "}runs every healer. Add{" "}
        <code className="bg-[var(--bg-elev-2)] rounded px-1 py-0.5 text-[10px]">&id=healer_id</code> to run just one.
      </p>

      {/* ── Recent events ─────────────────────────────────────── */}
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
        Recent events ({events.length})
      </h2>
      {events.length === 0 ? (
        <div className="mt-3 glass rounded-2xl p-8 text-center">
          <Activity size={32} className="mx-auto text-[var(--muted)] opacity-50" />
          <p className="mt-3 text-sm text-[var(--muted)]">
            No heal events yet. Trigger via{" "}
            <Link href="#" className="underline">GET /api/cron/heal?token=…</Link> or wait for the cron to fire.
          </p>
        </div>
      ) : (
        <div className="mt-3 glass rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-[var(--muted)] border-b border-[var(--border)] text-left">
                <th className="p-3 font-medium">When</th>
                <th className="p-3 font-medium">Healer</th>
                <th className="p-3 font-medium">Acted</th>
                <th className="p-3 font-medium">OK</th>
                <th className="p-3 font-medium">Summary</th>
                <th className="p-3 font-medium">Triggered</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-[var(--border)]/30 last:border-0">
                  <td className="p-3 text-xs text-[var(--muted)] whitespace-nowrap">{relTime(e.created_at)}</td>
                  <td className="p-3 text-xs font-mono">{e.healer_id}</td>
                  <td className="p-3 text-xs">{e.acted ? <span className="text-[var(--accent-2)]">●</span> : <span className="text-[var(--muted)]">—</span>}</td>
                  <td className="p-3 text-xs">{e.ok ? <CheckCircle2 size={12} className="text-[var(--good)]" /> : <AlertTriangle size={12} className="text-[var(--bad)]" />}</td>
                  <td className="p-3 text-xs text-[var(--muted)] max-w-md">{e.summary}</td>
                  <td className="p-3 text-[10px] text-[var(--muted)] uppercase">{e.triggered_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
