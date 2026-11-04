"use client";

// Comp Intelligence search form + result display. Boost-tier only. Hits
// /api/comp/lookup which does its own cache + Claude-with-websearch.

import { useState } from "react";
import { Search, Loader2, AlertCircle, RefreshCcw, ExternalLink, Sparkles } from "lucide-react";
import type { CompBenchmark } from "@/lib/types";
import { renderMarkdown } from "@/lib/markdown";

export default function CompLookup() {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [level, setLevel] = useState("");
  const [geography, setGeography] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ benchmark: CompBenchmark; source: "cache" | "fresh" } | null>(null);

  async function run(forceRefresh = false) {
    if (!company.trim() || !role.trim()) {
      setError("Company and role are required.");
      return;
    }
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/comp/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: company.trim(),
          role: role.trim(),
          level: level.trim() || null,
          geography: geography.trim() || null,
          force_refresh: forceRefresh,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError((j as { help?: string; error?: string }).help ?? (j as { error?: string }).error ?? "lookup_failed");
        return;
      }
      setResult({ benchmark: j.benchmark, source: j.source });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "fetch_error");
    } finally { setBusy(false); }
  }

  return (
    <section className="space-y-4">
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Company">
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Anthropic"
              className="form-input" />
          </Field>
          <Field label="Role">
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Solutions Architect"
              className="form-input" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Level (optional)">
            <input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Senior / Staff / L6"
              className="form-input" />
          </Field>
          <Field label="Geography (optional)">
            <input value={geography} onChange={(e) => setGeography(e.target.value)} placeholder="United States — remote"
              className="form-input" />
          </Field>
        </div>
        <button onClick={() => run(false)} disabled={busy}
          className="btn-cosmic w-full inline-flex items-center justify-center gap-2 text-sm disabled:opacity-50">
          {busy ? <><Loader2 size={14} className="animate-spin" /> Researching with Claude + web search…</> : <><Search size={14} /> Look up comp</>}
        </button>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--bad)]/40 bg-[var(--bad-soft)] p-2.5 text-xs text-[var(--bad)]">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {result && <BenchmarkCard result={result} onRefresh={() => run(true)} busy={busy} />}
    </section>
  );
}

function BenchmarkCard({ result, onRefresh, busy }: { result: { benchmark: CompBenchmark; source: "cache" | "fresh" }; onRefresh: () => void; busy: boolean }) {
  const b = result.benchmark;
  const totalBand = (b.total_low != null && b.total_high != null)
    ? `$${b.total_low.toLocaleString()}–$${b.total_high.toLocaleString()}`
    : "Total band not stated";
  const baseBand = (b.base_low != null && b.base_high != null)
    ? `$${b.base_low.toLocaleString()}–$${b.base_high.toLocaleString()}`
    : "Base band not stated";

  return (
    <article className="glass-card rounded-2xl p-5 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{b.company} · {b.role}</h3>
          <p className="text-xs text-[var(--muted)]">
            {b.level ?? "Any level"} · {b.geography ?? "Any geography"} ·
            {" "}{b.confidence}% confidence ·
            {" "}{result.source === "cache" ? "from cache" : "freshly researched"} ·
            {" "}{new Date(b.researched_at).toLocaleDateString()}
          </p>
        </div>
        <button onClick={onRefresh} disabled={busy} title="Re-research with fresh web search"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-1.5 text-[var(--muted)] hover:text-[var(--accent-2)] disabled:opacity-50">
          <RefreshCcw size={14} className={busy ? "animate-spin" : ""} />
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)] p-3">
          <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">Total comp (USD/yr)</p>
          <p className="mt-1 font-mono text-lg font-bold">{totalBand}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)] p-3">
          <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">Base salary (USD/yr)</p>
          <p className="mt-1 font-mono text-lg font-bold">{baseBand}</p>
        </div>
      </div>

      {b.equity_notes && (
        <div className="rounded-xl border border-[var(--accent-2)]/30 bg-[var(--accent-2-soft)] p-3 text-xs">
          <p className="text-[10px] uppercase tracking-widest text-[var(--accent-2)] mb-1 inline-flex items-center gap-1">
            <Sparkles size={10} /> Equity / variable
          </p>
          <p>{b.equity_notes}</p>
        </div>
      )}

      {b.narrative_md && (
        <div className="md-output text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(b.narrative_md) }} />
      )}

      {b.sources.length > 0 && (
        <section>
          <h4 className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-1">Sources</h4>
          <ul className="space-y-1">
            {b.sources.map((s, i) => (
              <li key={i} className="text-xs">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-[var(--accent-2)] hover:underline inline-flex items-center gap-1">
                    {s.label || s.url} <ExternalLink size={9} />
                  </a>
                ) : (
                  <span>{s.label}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-[var(--muted)] uppercase tracking-widest mb-1">{label}</span>
      {children}
    </label>
  );
}
