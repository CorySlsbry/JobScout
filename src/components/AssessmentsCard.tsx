"use client";

// Settings card for managing assessments. List, toggle active, delete,
// open the upload modal. Mirrors the ResumeManager UX.

import { useState, useTransition } from "react";
import { Sparkles, Upload, Trash2, Star, StarOff, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import type { Assessment } from "@/lib/types";
import AssessmentUploadModal from "./AssessmentUploadModal";

export default function AssessmentsCard({ initial }: { initial: Assessment[] }) {
  const [items, setItems] = useState<Assessment[]>(initial);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);

  async function refresh() {
    const r = await fetch("/api/assessments");
    if (r.ok) {
      const j = await r.json() as { assessments: Assessment[] };
      setItems(j.assessments);
    }
  }

  function toggleActive(a: Assessment) {
    start(async () => {
      const r = await fetch(`/api/assessments/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !a.is_active }),
      });
      if (r.ok) await refresh();
    });
  }

  function remove(a: Assessment) {
    if (!confirm(`Delete "${a.name}"? This can't be undone.`)) return;
    start(async () => {
      const r = await fetch(`/api/assessments/${a.id}`, { method: "DELETE" });
      if (r.ok) await refresh();
    });
  }

  const activeCount = items.filter((a) => a.is_active).length;

  return (
    <section className="glass rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)] flex items-center gap-1.5">
            <Sparkles size={12} /> Assessments
            {items.length > 0 && (
              <span className="text-[var(--muted)] font-medium">· {activeCount}/{items.length} active</span>
            )}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Upload assessment results (Zapier AI Fluency, HackerRank, portfolio reviews). <strong className="text-[var(--fg)]">Active</strong> ones fold into every cover letter, proposal draft, and job score automatically.
          </p>
        </div>
        <button onClick={() => setAdding(true)}
          className="btn-cosmic text-xs inline-flex items-center gap-1.5 shrink-0">
          <Upload size={13} /> Add
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
          No assessments yet. <button onClick={() => setAdding(true)} className="underline decoration-[var(--accent-2)]/40 hover:decoration-[var(--accent-2)]">Add your first one</button> — phone screenshot, PDF, or paste.
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((a) => {
            const isExpanded = expanded === a.id;
            return (
              <li key={a.id}
                className={`rounded-xl border p-3 transition-colors ${
                  a.is_active
                    ? "border-[var(--accent-2)]/40 bg-[var(--accent-2-soft)]"
                    : "border-[var(--border)] bg-[var(--bg-elev-2)] opacity-70"
                }`}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{a.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                      <span className="uppercase tracking-wider">{a.source_kind}</span>
                      <span>·</span>
                      <span>{(a.summary_md.length / 1000).toFixed(1)}k chars</span>
                      {a.source_url && (
                        <>
                          <span>·</span>
                          <a href={a.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[var(--accent-2)] hover:underline">
                            source <ExternalLink size={9} />
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleActive(a)} disabled={pending}
                      title={a.is_active ? "Deactivate (won't be folded into prompts)" : "Activate"}
                      className={`rounded-lg p-1.5 ${a.is_active ? "text-[var(--accent-2)] bg-[var(--accent-2)]/15" : "text-[var(--muted)] border border-[var(--border)] bg-[var(--bg-elev)] hover:text-[var(--accent-2)]"} disabled:opacity-50`}>
                      {a.is_active ? <Star size={14} fill="currentColor" /> : <StarOff size={14} />}
                    </button>
                    <button onClick={() => setExpanded(isExpanded ? null : a.id)}
                      title={isExpanded ? "Collapse" : "Show summary"}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-1.5 text-[var(--muted)] hover:text-[var(--fg)]">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button onClick={() => remove(a)} disabled={pending} title="Delete"
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-1.5 text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/40 disabled:opacity-50">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <pre className="mt-3 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--fg)] bg-[var(--bg-elev)] rounded-lg p-3 max-h-72 overflow-y-auto">
                    {a.summary_md}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && <AssessmentUploadModal onClose={() => setAdding(false)} onSaved={() => { void refresh(); setAdding(false); }} />}
    </section>
  );
}
