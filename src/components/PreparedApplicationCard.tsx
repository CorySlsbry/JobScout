"use client";

// One auto-prepared application on /autopilot. Shows the job, the AI-generated
// resume + cover letter (copyable), and one-tap Open + Apply / Mark applied / Dismiss.

import { useState } from "react";
import { ExternalLink, Copy, Check, ChevronDown, Send, X, FileText, Mail } from "lucide-react";
import { applyAction, dismissAction } from "@/app/actions";
import type { PreparedApplication } from "@/lib/autopilot";

export default function PreparedApplicationCard({ app }: { app: PreparedApplication }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"resume" | "cover" | null>(null);
  const score = Math.round(app.match_score ?? 0);

  async function copy(which: "resume" | "cover") {
    const text = which === "resume" ? app.prepared_resume_md : app.prepared_cover_letter;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <article className="glass rounded-2xl p-4" style={{ borderColor: "color-mix(in srgb, var(--good) 30%, transparent)" }}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl px-2.5 py-1.5 text-center font-bold" style={{ background: "var(--good-soft)", color: "var(--good)" }}>
          <div className="text-lg leading-none">{score}</div>
          <div className="text-[9px] uppercase tracking-wide opacity-80">match</div>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight">{app.job_title ?? "Job"}</h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{app.job_company ?? "Unknown company"}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {app.job_url && (
              <a href={app.job_url} target="_blank" rel="noreferrer" className="btn-cosmic inline-flex items-center gap-1.5 text-xs">
                Open + Apply <ExternalLink size={12} />
              </a>
            )}
            <button
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1.5 text-xs font-medium hover:border-[var(--accent-2)]"
            >
              <ChevronDown size={12} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
              {open ? "Hide" : "Resume + letter"}
            </button>
            <form action={applyAction} className="contents">
              <input type="hidden" name="job_id" value={app.job_id} />
              <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-[var(--good)]/40 bg-[var(--bg-elev)] px-2.5 py-1.5 text-xs font-medium text-[var(--good)] hover:bg-[var(--good-soft)]">
                <Send size={12} /> Mark applied
              </button>
            </form>
            <form action={dismissAction} className="contents">
              <input type="hidden" name="job_id" value={app.job_id} />
              <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:border-[var(--bad)]/50 hover:text-[var(--bad)]">
                <X size={12} /> Dismiss
              </button>
            </form>
          </div>
        </div>
      </div>

      {open && (
        <div className="mt-3 border-t border-[var(--border)] pt-3 space-y-4">
          {app.prepared_resume_md && (
            <Block icon={<FileText size={11} />} label="Tailored resume" onCopy={() => copy("resume")} copied={copied === "resume"} text={app.prepared_resume_md} />
          )}
          {app.prepared_cover_letter && (
            <Block icon={<Mail size={11} />} label="Cover letter" onCopy={() => copy("cover")} copied={copied === "cover"} text={app.prepared_cover_letter} />
          )}
        </div>
      )}
    </article>
  );
}

function Block({ icon, label, onCopy, copied, text }: { icon: React.ReactNode; label: string; onCopy: () => void; copied: boolean; text: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent-2)] inline-flex items-center gap-1">
          {icon} {label}
        </span>
        <button onClick={onCopy} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-2 py-0.5 text-[11px] font-medium hover:border-[var(--accent-2)]">
          {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] p-3 font-sans text-xs leading-relaxed text-[var(--fg)] max-h-72 overflow-y-auto">{text}</pre>
    </div>
  );
}
