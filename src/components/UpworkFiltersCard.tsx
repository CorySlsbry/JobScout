"use client";

// Admin-only Upwork filter toggles. Hard filters: any "true" → the scorer
// short-circuits to verdict=skip. Cheap pre-filter saves Claude calls.

import { Filter } from "lucide-react";
import type { UpworkFilters } from "@/lib/types";
import { saveUpworkFiltersAction } from "@/app/actions";

export default function UpworkFiltersCard({ filters }: { filters: UpworkFilters }) {
  return (
    <section className="glass rounded-2xl p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)] flex items-center gap-1.5">
        <Filter size={12} /> Upwork filters
      </h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Hard filters — if any trip, the scorer skips the job without spending a Claude call.
      </p>

      <form action={saveUpworkFiltersAction} className="mt-3 space-y-3 text-sm">
        <Toggle name="no_time_tracker" label="No Upwork time-tracker / screenshots / activity monitoring" defaultChecked={filters.no_time_tracker} />
        <Toggle name="no_fixed_schedule" label="No fixed clock-in hours / mandatory daily standups / on-call" defaultChecked={filters.no_fixed_schedule} />
        <Toggle name="hourly_only" label="Hourly contracts only (skip fixed-price)" defaultChecked={filters.hourly_only} />
        <Toggle name="no_onsite" label="Remote only (skip on-site / hybrid)" defaultChecked={filters.no_onsite} />
        <Toggle name="no_long_term" label="Short engagements only (skip 3+ month commitments)" defaultChecked={filters.no_long_term} />

        <div className="grid grid-cols-3 gap-2 pt-1">
          <NumField name="min_hourly_rate" label="Min $/hr" defaultValue={filters.min_hourly_rate} />
          <NumField name="min_fixed_budget" label="Min fixed $" defaultValue={filters.min_fixed_budget} />
          <NumField name="max_proposals_already" label="Max bids" defaultValue={filters.max_proposals_already} />
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--muted)] mb-1">Include keywords — JD must contain ≥1 of these (else skip). Empty = no positive filter.</span>
          <textarea
            name="include_keywords"
            defaultValue={filters.include_keywords?.join(", ") ?? ""}
            rows={3}
            placeholder="automation, n8n, API, web app, full-stack, ..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 font-mono text-xs focus:border-[var(--accent-2)] outline-none"
          />
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            Pre-filter: a &quot;logo design&quot; job auto-skips without burning a Claude call. Edit anytime.
          </p>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--muted)] mb-1">Exclude keywords (comma-separated, case-insensitive substring match)</span>
          <textarea
            name="exclude_keywords"
            defaultValue={filters.exclude_keywords.join(", ")}
            rows={2}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 font-mono text-xs focus:border-[var(--accent-2)] outline-none"
          />
        </label>

        <button type="submit" className="btn-cosmic">Save filters</button>
      </form>
    </section>
  );
}

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer">
      <input type="checkbox" name={name} defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-[var(--border)] bg-[var(--bg-elev-2)] accent-[var(--accent-2)]" />
      <span>{label}</span>
    </label>
  );
}

function NumField({ name, label, defaultValue }: { name: string; label: string; defaultValue: number }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-[var(--muted)] mb-1 uppercase tracking-wider">{label}</span>
      <input
        name={name}
        type="number"
        min={0}
        step={name === "min_hourly_rate" ? 5 : name === "min_fixed_budget" ? 100 : 1}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-2.5 py-1.5 text-sm focus:border-[var(--accent-2)] outline-none"
      />
    </label>
  );
}
