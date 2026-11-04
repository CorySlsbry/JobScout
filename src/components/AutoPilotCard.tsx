"use client";

// Auto-Pilot toggle + threshold. When on, the autopilot cron auto-generates a
// tailored resume + cover letter for every job clearing the score threshold and
// stages them at /autopilot as "ready to apply".
//
// Client component: the threshold slider shows a live value via React state,
// and the form posts to the saveAutoPilotAction server action.

import { useState } from "react";
import { saveAutoPilotAction } from "@/app/actions";
import { Rocket, Info } from "lucide-react";
import type { Profile } from "@/lib/types";

export default function AutoPilotCard({ profile }: { profile: Profile }) {
  const enabled = !!profile.autopilot_enabled;
  const [score, setScore] = useState(profile.autopilot_min_score ?? 85);
  const lastRun = profile.autopilot_last_run;

  return (
    <section className="glass rounded-2xl p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)] flex items-center gap-1.5">
        <Rocket size={12} /> Auto-Pilot
      </h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        When on, every job scoring at or above your threshold gets a tailored
        resume + cover letter auto-generated and staged at{" "}
        <a href="/autopilot" className="text-[var(--accent-2)] underline hover:no-underline">/autopilot</a>{" "}
        — ready to review and apply in one tap.
        {lastRun && <> Last run {relTime(lastRun)}.</>}
      </p>

      <form action={saveAutoPilotAction} className="mt-4 space-y-4 text-sm">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)] p-3 cursor-pointer">
          <span className="font-semibold">Enable Auto-Pilot</span>
          <input
            type="checkbox" name="autopilot_enabled"
            defaultChecked={enabled}
            className="h-5 w-5 accent-[var(--accent-2)]"
          />
        </label>

        <div>
          <label htmlFor="autopilot_min_score" className="font-semibold">
            Auto-prepare jobs scoring ≥ <span className="text-[var(--accent-2)]">{score}</span>
          </label>
          <input
            id="autopilot_min_score" name="autopilot_min_score"
            type="range" min={50} max={100} step={5}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--accent-2)]"
          />
          <div className="flex justify-between text-[10px] text-[var(--muted)] mt-0.5">
            <span>50 (looser)</span>
            <span className="font-mono text-[var(--accent-2)] font-bold">{score}</span>
            <span>100 (strict)</span>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-[var(--bg-elev-2)] p-2.5 text-[11px] text-[var(--muted)]">
          <Info size={13} className="mt-0.5 shrink-0 text-[var(--accent-2)]" />
          <span>
            Auto-Pilot prepares everything so applying is one tap. It never submits to a job board on your behalf —
            you always review and click Apply yourself (board terms of service + your control).
          </span>
        </div>

        <button type="submit" className="btn-cosmic w-full inline-flex items-center justify-center gap-1.5">
          <Rocket size={14} /> Save Auto-Pilot
        </button>
      </form>
    </section>
  );
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
