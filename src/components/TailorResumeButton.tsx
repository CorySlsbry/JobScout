"use client";

import { useMemo, useState } from "react";
import { Sparkles, Copy, Download, X, Loader2, AlertCircle, Eye, FileText, FileType, FileDown, Printer } from "lucide-react";
import { renderMarkdown, markdownToPlainText } from "@/lib/markdown";
// PDF: prefer direct file download (no print dialog). Falls back to
// print-to-pdf if the lazy import fails.
// import { openPrintWindow } from "@/lib/pdf-print";

type ViewMode = "formatted" | "markdown" | "plain";

export default function TailorResumeButton({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const [open, setOpen] = useState(false);
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("formatted");
  const [copied, setCopied] = useState<string | null>(null);

  const html = useMemo(() => (output ? renderMarkdown(output) : ""), [output]);
  const plain = useMemo(() => (output ? markdownToPlainText(output) : ""), [output]);

  async function tailor() {
    setOpen(true);
    setOutput("");
    setError(null);
    setBusy(true);
    setView("formatted");

    try {
      const resp = await fetch("/api/tailor-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        const help = (j as { help?: string }).help;
        const code = (j as { error?: string }).error ?? "request_failed";
        setError(help ? `${code}: ${help}` : code);
        return;
      }
      const reader = resp.body?.getReader();
      if (!reader) { setError("stream_unavailable"); return; }
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        setOutput((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "fetch_error");
    } finally {
      setBusy(false);
    }
  }

  async function copy(kind: "markdown" | "plain") {
    const text = kind === "markdown" ? output : plain;
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  function download(kind: "markdown" | "plain") {
    const text = kind === "markdown" ? output : plain;
    const ext = kind === "markdown" ? "md" : "txt";
    const mime = kind === "markdown" ? "text/markdown" : "text/plain";
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resume-${jobTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadDocx() {
    setError(null);
    try {
      const { markdownToDocxBlob, downloadBlob } = await import("@/lib/docx-export");
      const filename = `resume-${jobTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.docx`;
      const { blob } = await markdownToDocxBlob(output, filename);
      downloadBlob(blob, filename);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "docx_failed");
    }
  }

  async function downloadPdf() {
    setError(null);
    try {
      const { markdownToPdfBlob, downloadBlob } = await import("@/lib/pdf-export");
      const filename = `resume-${jobTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
      const { blob } = await markdownToPdfBlob(output, filename);
      downloadBlob(blob, filename);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "pdf_failed");
    }
  }

  const TABS: Array<{ key: ViewMode; label: string; Icon: typeof Eye; tip: string }> = [
    { key: "formatted", label: "Preview",  Icon: Eye,      tip: "How a human reads it" },
    { key: "plain",     label: "Plain",    Icon: FileText, tip: "Plain text — paste into ATS forms" },
    { key: "markdown",  label: "Markdown", Icon: FileType, tip: "Raw markdown source" },
  ];

  return (
    <>
      <button
        onClick={tailor}
        className="btn-cosmic inline-flex items-center gap-2 text-sm"
        title="Generate a resume tailored for this specific job using Claude — no fabrication, ATS-friendly"
      >
        <Sparkles size={15} /> Tailor my resume
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm" onClick={() => !busy && setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass relative w-full max-w-3xl max-h-[88vh] flex flex-col rounded-3xl"
            style={{ boxShadow: "var(--shadow-glow), var(--shadow-card)" }}
          >
            <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="grad-text font-bold">★</span>
                <span className="font-semibold truncate">Tailored for: {jobTitle}</span>
              </div>
              <button onClick={() => !busy && setOpen(false)} disabled={busy} aria-label="Close"
                className="rounded-full p-1.5 text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-elev-2)] disabled:opacity-50">
                <X size={18} />
              </button>
            </header>

            {/* Primary downloads — the whole point of generating this is to upload it. */}
            {output && !busy && (
              <div className="px-5 py-3 border-b border-[var(--border)] bg-gradient-to-br from-[var(--accent-2-soft)] to-transparent">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent-2)] mb-2">
                  Ready to apply — download for upload
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={downloadDocx}
                    className="btn-cosmic inline-flex items-center gap-2 text-sm"
                    title="Microsoft Word — gold-standard ATS upload format">
                    <FileDown size={15} /> Download .docx
                  </button>
                  <button onClick={downloadPdf}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[var(--accent-2)]/50 bg-[var(--bg-elev)] px-4 py-2.5 text-sm font-semibold text-[var(--fg)] hover:border-[var(--accent-2)] hover:bg-[var(--accent-2-soft)] transition-colors"
                    title="Opens a print preview — pick 'Save as PDF' to get a .pdf file">
                    <Printer size={15} /> Download .pdf
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-[var(--muted)]">
                  <strong className="text-[var(--fg)]">.docx</strong> for ATS that ask for Word. <strong className="text-[var(--fg)]">.pdf</strong> when the application form says &quot;PDF or DOCX&quot;.
                </p>
              </div>
            )}

            {/* View tabs + secondary copy/export */}
            {output && !busy && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 border-b border-[var(--border)]">
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] p-0.5">
                  {TABS.map(({ key, label, Icon, tip }) => (
                    <button
                      key={key}
                      onClick={() => setView(key)}
                      title={tip}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        view === key
                          ? "bg-[var(--bg-elev)] text-[var(--fg)] shadow-sm"
                          : "text-[var(--muted)] hover:text-[var(--fg)]"
                      }`}
                    >
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button onClick={() => copy(view === "plain" ? "plain" : "markdown")}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1 text-xs font-medium hover:border-[var(--accent-2)] inline-flex items-center gap-1"
                    title={view === "plain" ? "Copy plain text — paste into ATS forms" : "Copy markdown"}>
                    <Copy size={12} /> {copied ? "Copied!" : view === "plain" ? "Copy plain" : "Copy"}
                  </button>
                  <button onClick={() => download("markdown")}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1 text-xs font-medium hover:border-[var(--accent-2)] inline-flex items-center gap-1"
                    title="Download as markdown (.md)">
                    <Download size={12} /> .md
                  </button>
                  <button onClick={() => download("plain")}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1 text-xs font-medium hover:border-[var(--accent-2)] inline-flex items-center gap-1"
                    title="Download as plain text (.txt) — for ATS forms that only accept text">
                    <Download size={12} /> .txt
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5">
              {error ? (
                <div className="rounded-xl border border-[var(--bad)]/40 bg-[var(--bad-soft)] p-4 text-sm text-[var(--bad)] flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Tailor failed</p>
                    <p className="mt-1 opacity-90">{error}</p>
                  </div>
                </div>
              ) : output ? (
                view === "formatted" ? (
                  <article className="md-output" dangerouslySetInnerHTML={{ __html: html }} />
                ) : view === "plain" ? (
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--fg)]">{plain}</pre>
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--fg)]">{output}</pre>
                )
              ) : busy ? (
                <div className="flex items-center gap-2 text-[var(--muted)] text-sm">
                  <Loader2 size={16} className="animate-spin" /> Tailoring with Claude Sonnet…
                </div>
              ) : null}
              {busy && output && view === "markdown" && (
                <span className="inline-block w-2 h-4 bg-[var(--accent-2)] animate-pulse ml-0.5 align-middle" />
              )}
            </div>

            <footer className="px-5 py-3 border-t border-[var(--border)] text-[10px] text-[var(--muted)] flex items-center gap-1.5">
              <Sparkles size={11} className="text-[var(--accent-2)]" />
              No fabrication · ATS-friendly formatting · Use <strong className="text-[var(--fg)]">Plain</strong> tab to paste into application forms.
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
