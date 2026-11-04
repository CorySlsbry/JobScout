"use client";

// Destructive: clear out the jobs feed. Admin-only — surfaces on Settings.
// Two modes:
//   - "Feed only" (default): drops noise (jobs with no app or saved/dismissed
//     status). Keeps anything in your active pipeline (applied/interview/etc.)
//     and forgets upwork_leads so the next watcher run is clean.
//   - "Wipe everything": nukes jobs + applications + leads. Profile, resumes,
//     assessments, calibration are untouched.

import { useState, useTransition } from "react";
import { Eraser, AlertTriangle, Loader2 } from "lucide-react";

export default function ClearJobsCard() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<null | { mode: string; jobsDeleted: number; jobsKept: number; appsDeleted: number; leadsDeleted: number }>(null);
  const [error, setError] = useState<string | null>(null);

  function run(mode: "feed" | "wipe") {
    const msg =
      mode === "feed"
        ? "Clear the feed? This drops jobs you haven't applied to + dismissed jobs + upwork leads. Your active pipeline is preserved."
        : "WIPE EVERYTHING? This deletes ALL jobs, ALL application history (including the Zapier app), and all upwork leads. Profile, resumes, assessments, and calibration are kept. This can't be undone.";
    if (!confirm(msg)) return;
    setError(null); setResult(null);
    start(async () => {
      try {
        const r = await fetch("/api/admin/clear-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        const j = await r.json();
        if (!r.ok) { setError((j as { error?: string }).error ?? "clear_failed"); return; }
        setResult(j as { mode: string; jobsDeleted: number; jobsKept: number; appsDeleted: number; leadsDeleted: number });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "fetch_error");
      }
    });
  }

  return (
    <section className="glass rounded-2xl p-4 border border-[var(--bad)]/20">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--bad)] flex items-center gap-1.5">
        <Eraser size={12} /> Clear out current jobs
      </h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Wipe the noisy feed. Use the safe option for normal cleanup — wipe-everything is for when you want a true blank slate.
      </p>

      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <button onClick={() => run("feed")} disabled={pending}
          className="btn-cosmic text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50">
          {pending ? <><Loader2 size={14} className="animate-spin" /> Clearing…</> : <><Eraser size={13} /> Clear feed (safe — keeps applied)</>}
        </button>
        <button onClick={() => run("wipe")} disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--bad)]/50 bg-[var(--bg-elev)] px-4 py-2.5 text-sm font-semibold text-[var(--bad)] hover:bg-[var(--bad-soft)] disabled:opacity-50">
          <AlertTriangle size={13} /> Wipe everything
        </button>
      </div>

      {result && (
        <div className="mt-3 rounded-lg border border-[var(--good)]/30 bg-[var(--good-soft)] p-3 text-xs text-[var(--good)]">
          <strong>Done ({result.mode}).</strong>{" "}
          Removed {result.jobsDeleted} job{result.jobsDeleted === 1 ? "" : "s"}, {result.appsDeleted} app{result.appsDeleted === 1 ? "" : "s"}, {result.leadsDeleted} Upwork lead{result.leadsDeleted === 1 ? "" : "s"}.
          {result.mode === "feed" && ` Kept ${result.jobsKept} in your pipeline.`}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-lg border border-[var(--bad)]/40 bg-[var(--bad-soft)] p-3 text-xs text-[var(--bad)] inline-flex items-start gap-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
    </section>
  );
}
