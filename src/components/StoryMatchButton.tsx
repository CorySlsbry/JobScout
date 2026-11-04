"use client";

// Predicts the 5-8 most likely behavioral questions for THIS specific job,
// matches them against the candidate's existing story bank, and flags the
// gaps. Powered by /api/stories/match (Claude Haiku).

import { useState } from "react";
import { Brain, X, Loader2, AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";

type Match = {
  question: string;
  rationale: string;
  match_story_id: string | null;
  match_quality: "strong" | "ok" | "stretch" | null;
  match_note: string;
};
type Gap = { question: string; what_to_capture: string };

export default function StoryMatchButton({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [gaps, setGaps] = useState<Gap[] | null>(null);

  async function run() {
    setOpen(true); setBusy(true); setError(null); setMatches(null); setGaps(null);
    try {
      const resp = await fetch("/api/stories/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const j = await resp.json();
      if (!resp.ok) { setError((j as { error?: string }).error ?? "request_failed"); return; }
      setMatches((j as { matches?: Match[] }).matches ?? []);
      setGaps((j as { gaps?: Gap[] }).gaps ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "fetch_error");
    } finally { setBusy(false); }
  }

  return (
    <>
      <button onClick={run} className="btn-premium-outline w-full inline-flex items-center justify-center gap-2 text-sm">
        <Brain size={15} /> Match story bank to this job
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm" onClick={() => !busy && setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="glass-card relative w-full max-w-2xl max-h-[88vh] flex flex-col rounded-card">
            <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Brain size={16} className="text-accent" />
                <span className="font-semibold">Story Bank match</span>
              </div>
              <button onClick={() => !busy && setOpen(false)} disabled={busy} className="rounded-full p-1.5 text-fg-muted hover:text-fg" aria-label="Close">
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
              {busy && (
                <div className="flex items-center gap-2 text-fg-muted">
                  <Loader2 size={16} className="animate-spin" /> Predicting behavioral questions and matching stories…
                </div>
              )}

              {error && (
                <div className="rounded-card border border-danger/40 bg-danger/10 p-4 flex items-start gap-2 text-danger">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Match failed</p>
                    <p className="mt-1 opacity-90">{error}</p>
                  </div>
                </div>
              )}

              {matches && matches.length > 0 && (
                <section>
                  <h3 className="text-tiny uppercase tracking-widest text-success mb-2">Likely questions · matched stories</h3>
                  <ul className="space-y-2">
                    {matches.map((m, i) => (
                      <li key={i} className="rounded-card border border-border bg-bg-elev/60 p-3">
                        <p className="font-semibold">{m.question}</p>
                        <p className="text-xs text-fg-muted italic mt-0.5">{m.rationale}</p>
                        {m.match_story_id ? (
                          <div className="mt-2 flex items-center gap-2">
                            <CheckCircle2 size={13} className={qualityColor(m.match_quality)} />
                            <span className={`text-xs ${qualityColor(m.match_quality)}`}>{m.match_quality?.toUpperCase()} match</span>
                            <span className="text-xs text-fg-muted">— story: <code className="font-mono">{m.match_story_id}</code></span>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-warning flex items-center gap-1">
                            <AlertTriangle size={12} /> No matching story in bank
                          </p>
                        )}
                        {m.match_note && <p className="text-xs text-fg-muted mt-1">{m.match_note}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {gaps && gaps.length > 0 && (
                <section>
                  <h3 className="text-tiny uppercase tracking-widest text-warning mb-2">Gaps to capture</h3>
                  <ul className="space-y-2">
                    {gaps.map((g, i) => (
                      <li key={i} className="rounded-card border border-warning/30 bg-warning/10 p-3">
                        <p className="font-semibold">{g.question}</p>
                        <p className="text-xs text-fg-muted mt-1">{g.what_to_capture}</p>
                      </li>
                    ))}
                  </ul>
                  <Link href="/stories" className="mt-3 inline-block btn-premium text-xs">
                    Add stories →
                  </Link>
                </section>
              )}

              {matches && matches.length === 0 && gaps && gaps.length === 0 && (
                <p className="text-fg-muted">No predictions returned. Either the JD lacks context or the model returned an empty plan.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function qualityColor(q: "strong" | "ok" | "stretch" | null | undefined): string {
  if (q === "strong") return "text-success";
  if (q === "ok") return "text-accent";
  if (q === "stretch") return "text-warning";
  return "text-fg-muted";
}
