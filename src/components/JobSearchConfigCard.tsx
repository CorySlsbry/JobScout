"use client";

// Job-pull control. THIS is the knob that decides what enters the feed —
// the search terms + locations sent to the job boards. Distinct from the
// post-pull filters in SearchTailoringCard.
//
// Includes a "Sync now" button so the user sees results immediately instead
// of waiting for the 2-hourly cron.

import { useState, useTransition } from "react";
import { Search, MapPin, Loader2, Check, RefreshCw } from "lucide-react";
import { saveJobSearchConfigAction, syncMySearchesAction } from "@/app/actions";
import type { Profile } from "@/lib/types";

export default function JobSearchConfigCard({ profile }: { profile: Profile }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncing, startSync] = useTransition();
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function onSave(formData: FormData) {
    setSaving(true); setSaved(false);
    try {
      await saveJobSearchConfigAction(formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function onSyncNow() {
    setSyncResult(null);
    startSync(async () => {
      const r = await syncMySearchesAction();
      if (r.ok) setSyncResult(`Scanned ${r.scanned} · ${r.inserted} new · ${r.updated} updated`);
      else setSyncResult(`Sync failed: ${r.error}`);
    });
  }

  return (
    <section className="glass rounded-2xl p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)] flex items-center gap-1.5">
        <Search size={12} /> Job sources — what gets pulled
      </h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        The search terms + locations we send to the job boards. This decides
        what <em>enters</em> your feed. (Filters below decide what&apos;s shown after.)
      </p>

      <form action={onSave} className="mt-4 space-y-4 text-sm">
        <div>
          <label htmlFor="search_queries" className="font-semibold inline-flex items-center gap-1.5">
            <Search size={13} className="text-[var(--accent-2)]" /> Search terms
          </label>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            One per line. Each becomes a board search. Empty = JobScout&apos;s default tech-role searches.
          </p>
          <textarea
            id="search_queries" name="search_queries"
            rows={3}
            defaultValue={(profile.search_queries ?? []).join("\n")}
            placeholder="react developer&#10;devops engineer&#10;product designer"
            className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent-2)]"
          />
        </div>

        <div>
          <label htmlFor="search_locations" className="font-semibold inline-flex items-center gap-1.5">
            <MapPin size={13} className="text-[var(--accent-2)]" /> Locations
          </label>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            One per line — &quot;Remote&quot;, &quot;Austin, TX&quot;, &quot;London, UK&quot;. Sent to each board verbatim.
          </p>
          <textarea
            id="search_locations" name="search_locations"
            rows={2}
            defaultValue={(profile.search_locations ?? []).join("\n")}
            placeholder="Remote&#10;Austin, TX"
            className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent-2)]"
          />
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox" name="search_remote_only"
            defaultChecked={!!profile.search_remote_only}
            className="accent-[var(--accent-2)]"
          />
          <span className="text-sm">Remote only (ignore the locations above, search Remote everywhere)</span>
        </label>

        <div className="flex items-center gap-2 flex-wrap">
          <button type="submit" disabled={saving} className="btn-cosmic text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
            {saved ? "Saved" : "Save sources"}
          </button>
          <button
            type="button" onClick={onSyncNow} disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2 text-sm font-medium hover:border-[var(--accent-2)] disabled:opacity-50"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {syncing ? "Scanning…" : "Sync now"}
          </button>
        </div>
        {syncResult && <p className="text-[11px] text-[var(--muted)]">{syncResult}</p>}
      </form>
    </section>
  );
}
