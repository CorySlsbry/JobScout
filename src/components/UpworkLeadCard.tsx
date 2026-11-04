"use client";

// One Upwork lead from the inbox watcher — score, dimensions, pre-drafted
// proposal, and apply/dismiss controls.

import { useState, useTransition } from "react";
import { ExternalLink, ChevronDown, Copy, Check, X, Sparkles } from "lucide-react";
import type { UpworkLead } from "@/lib/types";
import { setUpworkLeadStatusAction } from "@/app/actions";

export default function UpworkLeadCard({ lead }: { lead: UpworkLead }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(lead.status);
  const [pending, start] = useTransition();

  const apply = lead.verdict === "apply";
  const scoreColor = lead.score >= 70 ? "var(--good)" : lead.score >= 40 ? "var(--warn)" : "var(--bad)";

  function mark(next: typeof status) {
    start(async () => {
      const fd = new FormData();
      fd.set("lead_id", lead.id);
      fd.set("status", next);
      await setUpworkLeadStatusAction(fd);
      setStatus(next);
    });
  }

  async function copyDraft() {
    if (!lead.draft_cover_letter) return;
    await navigator.clipboard.writeText(lead.draft_cover_letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <article
      className={`glass rounded-2xl p-4 transition-opacity ${status === "dismissed" ? "opacity-45" : ""}`}
      style={apply ? { borderColor: "color-mix(in srgb, var(--good) 35%, transparent)" } : undefined}
    >
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 rounded-xl px-2.5 py-1.5 text-center font-bold"
          style={{ background: "var(--bg-elev-2)", color: scoreColor }}
        >
          <div className="text-lg leading-none">{lead.score}</div>
          <div className="text-[9px] uppercase tracking-wide opacity-80">{lead.verdict}</div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-tight">{lead.title}</h3>
            {status === "applied" && (
              <span className="shrink-0 rounded-full bg-[var(--good-soft)] text-[var(--good)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest">
                Applied
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {lead.budget_text ?? "Budget not listed"}
            {lead.source_search && <> · search: {lead.source_search}</>}
            {lead.suggested_bid != null && <> · suggested {lead.suggested_bid_kind ?? "bid"}: ${lead.suggested_bid.toLocaleString()}</>}
          </p>

          {lead.reasons.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs">
              {lead.reasons.slice(0, 2).map((r, i) => <li key={i}>· {r}</li>)}
            </ul>
          )}
          {lead.filter_violations.length > 0 && (
            <p className="mt-1 text-xs text-[var(--bad)]">Filter: {lead.filter_violations.join("; ")}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={lead.job_url}
              target="_blank"
              rel="noreferrer"
              onClick={() => status === "new" && mark("viewed")}
              className="btn-cosmic inline-flex items-center gap-1.5 text-xs"
            >
              Open on Upwork <ExternalLink size={12} />
            </a>
            {(lead.draft_cover_letter || lead.dimensions.length > 0) && (
              <button
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1.5 text-xs font-medium hover:border-[var(--accent-2)]"
              >
                <ChevronDown size={12} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
                {open ? "Hide" : "Detail + draft"}
              </button>
            )}
            {status !== "applied" && (
              <button
                onClick={() => mark("applied")}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--good)]/40 bg-[var(--bg-elev)] px-2.5 py-1.5 text-xs font-medium text-[var(--good)] hover:bg-[var(--good-soft)] disabled:opacity-50"
              >
                <Check size={12} /> Mark applied
              </button>
            )}
            {status !== "dismissed" && (
              <button
                onClick={() => mark("dismissed")}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:border-[var(--bad)]/50 hover:text-[var(--bad)] disabled:opacity-50"
              >
                <X size={12} /> Dismiss
              </button>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div className="mt-3 border-t border-[var(--border)] pt-3 space-y-3">
          {lead.dimensions.length > 0 && (
            <div className="grid gap-1.5">
              {lead.dimensions.map((d, i) => {
                const c = d.score >= 70 ? "var(--good)" : d.score >= 40 ? "var(--warn)" : "var(--bad)";
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">{d.name}</span>
                      <span style={{ color: c }} className="font-mono font-bold">{d.score}</span>
                    </div>
                    <div className="h-1 rounded-full bg-[var(--bg-elev-2)] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${d.score}%`, background: c }} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)] leading-snug">{d.note}</p>
                  </div>
                );
              })}
            </div>
          )}

          {lead.draft_cover_letter && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent-2)] inline-flex items-center gap-1">
                  <Sparkles size={11} /> Pre-drafted proposal
                </span>
                <button
                  onClick={copyDraft}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-2 py-0.5 text-[11px] font-medium hover:border-[var(--accent-2)]"
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] p-3 font-sans text-xs leading-relaxed text-[var(--fg)]">
                {lead.draft_cover_letter}
              </pre>
              <p className="mt-1 text-[10px] text-[var(--muted)]">
                Open the job on Upwork → the JobScout extension fills this + the screening questions. Review, then Send.
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
