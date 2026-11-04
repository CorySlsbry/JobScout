"use client";

// Per-user Upwork search config. Lives on /settings. Pro+ only.
//
// PRIMARY: keyword phrases (chips) → profile.upwork_search_queries. The cron
// runs each phrase through an Apify Upwork scraper (gio21/upwork-jobs-scraper)
// and stages scored matches at /upwork-leads. This is the live mechanism since
// Upwork retired public RSS (the /ab/feed/jobs/rss endpoints now return 410).
//
// ADVANCED (collapsed): paste a saved-search RSS link. Kept for anyone who
// still has a personal token'd feed; it fails soft if Upwork rejects it.

import { useState } from "react";
import { saveUpworkSearchQueriesAction, saveUpworkSourcesAction } from "@/app/actions";
import { Rss, Plus, X, Search, ChevronDown } from "lucide-react";
import type { Profile } from "@/lib/types";

const SUGGESTIONS = [
  "AI consultant",
  "AI automation",
  "Claude API",
  "LLM integration",
  "AI strategy",
  "AI agent development",
  "n8n automation",
  "prompt engineering",
];

export default function UpworkSourcesCard({ profile }: { profile: Profile }) {
  const [queries, setQueries] = useState<string[]>(profile.upwork_search_queries ?? []);
  const [input, setInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rssUrls, setRssUrls] = useState((profile.upwork_search_urls ?? []).join("\n"));
  const apifyRun = profile.upwork_apify_last_run;
  const rssRun = profile.upwork_rss_last_run;

  function addChip(value: string) {
    const v = value.replace(/\s+/g, " ").trim();
    if (v.length < 2 || v.length > 100) return;
    setQueries((prev) => (prev.some((q) => q.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v].slice(0, 8)));
    setInput("");
  }
  function removeChip(i: number) {
    setQueries((prev) => prev.filter((_, idx) => idx !== i));
  }

  const unusedSuggestions = SUGGESTIONS.filter((s) => !queries.some((q) => q.toLowerCase() === s.toLowerCase()));

  return (
    <section className="glass rounded-2xl p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)] flex items-center gap-1.5">
        <Search size={12} /> Upwork search
      </h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Add the kind of Upwork work you want — one phrase per chip. We scan Upwork on a schedule, score new jobs against your resume, and stage matches at{" "}
        <a href="/upwork-leads" className="text-[var(--accent-2)] underline hover:no-underline">/upwork-leads</a>.
        {apifyRun && <> Last scan {relTime(apifyRun)}.</>}
      </p>

      {/* ── PRIMARY: keyword chips → upwork_search_queries ───────────── */}
      <form action={saveUpworkSearchQueriesAction} className="mt-4 space-y-3">
        <input type="hidden" name="upwork_search_queries" value={queries.join("\n")} />

        {/* chips */}
        {queries.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {queries.map((q, i) => (
              <span key={q} className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-2)]/30 bg-[var(--accent-2-soft)]/50 px-2.5 py-1 text-xs text-[var(--fg)]">
                {q}
                <button type="button" onClick={() => removeChip(i)} aria-label={`Remove ${q}`} className="text-[var(--muted)] hover:text-[var(--fg)]">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* add input */}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChip(input); } }}
            placeholder="e.g. AI automation consultant"
            maxLength={100}
            disabled={queries.length >= 8}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-2)] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => addChip(input)}
            disabled={queries.length >= 8}
            className="btn-cosmic inline-flex items-center justify-center gap-1.5 text-xs px-3 disabled:opacity-50"
          >
            <Plus size={13} /> Add
          </button>
        </div>

        {/* one-tap suggestions */}
        {unusedSuggestions.length > 0 && queries.length < 8 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] text-[var(--muted)] self-center">Try:</span>
            {unusedSuggestions.slice(0, 6).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addChip(s)}
                className="rounded-full border border-dashed border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] hover:border-[var(--accent-2)] hover:text-[var(--fg)]"
              >
                + {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] text-[var(--muted)]">
            {queries.length}/8 searches · we scan the first 4 each cycle
          </span>
          <button type="submit" className="btn-cosmic text-xs">Save searches</button>
        </div>
      </form>

      {/* ── ADVANCED: legacy RSS paste (collapsed) ──────────────────── */}
      <button
        type="button"
        onClick={() => setShowAdvanced((s) => !s)}
        className="mt-4 inline-flex items-center gap-1 text-[11px] text-[var(--muted)] hover:text-[var(--fg)]"
      >
        <ChevronDown size={12} className={showAdvanced ? "rotate-180 transition-transform" : "transition-transform"} />
        Advanced: paste a saved-search RSS link
      </button>
      {showAdvanced && (
        <form action={saveUpworkSourcesAction} className="mt-2 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)]/40 p-3">
          <p className="text-[11px] text-[var(--muted)] flex items-start gap-1.5">
            <Rss size={12} className="mt-0.5 shrink-0" />
            Upwork retired its public RSS feeds, so this only works if you have a personal token&apos;d saved-search link. Most users should just use the searches above.
            {rssRun && <> Last poll {relTime(rssRun)}.</>}
          </p>
          <textarea
            name="upwork_search_urls"
            rows={2}
            value={rssUrls}
            onChange={(e) => setRssUrls(e.target.value)}
            placeholder="https://www.upwork.com/...rss?...securityToken=..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-xs font-mono outline-none focus:border-[var(--accent-2)]"
          />
          <div className="flex justify-end">
            <button type="submit" className="btn-cosmic text-xs">Save RSS link</button>
          </div>
        </form>
      )}
    </section>
  );
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
