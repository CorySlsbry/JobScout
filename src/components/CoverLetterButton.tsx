"use client";

import { useMemo, useState } from "react";
import { FileText, Copy, Download, X, Loader2, AlertCircle, Eye, FileType, FileDown, Printer } from "lucide-react";
import { renderMarkdown, markdownToPlainText } from "@/lib/markdown";
// PDF: direct file download via jsPDF (lazy-loaded).
// import { openPrintWindow } from "@/lib/pdf-print";

type ViewMode = "formatted" | "plain" | "markdown";

export default function CoverLetterButton({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const [open, setOpen] = useState(false);
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("formatted");
  const [copied, setCopied] = useState(false);

  const html = useMemo(() => (output ? renderMarkdown(output) : ""), [output]);
  const plain = useMemo(() => (output ? markdownToPlainText(output) : ""), [output]);

  async function generate() {
    setOpen(true);
    setOutput("");
    setError(null);
    setBusy(true);
    setView("formatted");
    try {
      const resp = await fetch("/api/generate-cover-letter", {
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

  async function copy() {
    const text = view === "markdown" ? output : plain;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download(kind: "plain" | "markdown") {
    const text = kind === "markdown" ? output : plain;
    const ext = kind === "markdown" ? "md" : "txt";
    const mime = kind === "markdown" ? "text/markdown" : "text/plain";
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cover-letter-${jobTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadDocx() {
    setError(null);
    try {
      const { markdownToDocxBlob, downloadBlob } = await import("@/lib/docx-export");
      const filename = `cover-letter-${jobTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.docx`;
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
      const filename = `cover-letter-${jobTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
      const { blob } = await markdownToPdfBlob(output, filename);
      downloadBlob(blob, filename);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "pdf_failed");
    }
  }

  const TABS: Array<{ key: ViewMode; label: string; Icon: typeof Eye; tip: string }> = [
    { key: "formatted", label: "Preview",  Icon: Eye,      tip: "How a human reads it" },
    { key: "plain",     label: "Plain",    Icon: FileText, tip: "Plain text for direct paste" },
    { key: "markdown",  label: "Markdown", Icon: FileType, tip: "Raw markdown source" },
  ];

  return (
    <>
      <button
        onClick={generate}
        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] font-semibold py-3 px-4 active:scale-[0.98] hover:border-[var(--accent-2)] transition-all text-sm inline-flex items-center justify-center gap-2"
        title="Generate a tailored cover letter using Claude — no fabrication"
      >
        <FileText size={15} /> Cover letter
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm" onClick={() => !busy && setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass relative w-full max-w-2xl max-h-[88vh] flex flex-col rounded-3xl"
            style={{ boxShadow: "var(--shadow-glow), var(--shadow-card)" }}
          >
            <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={16} className="text-[var(--accent-2)] shrink-0" />
                <span className="font-semibold truncate">Cover letter for: {jobTitle}</span>
              </div>
              <button onClick={() => !busy && setOpen(false)} disabled={busy} aria-label="Close"
                className="rounded-full p-1.5 text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-elev-2)] disabled:opacity-50">
                <X size={18} />
              </button>
            </header>

            {/* Primary downloads for the application */}
            {output && !busy && (
              <div className="px-5 py-3 border-b border-[var(--border)] bg-gradient-to-br from-[var(--accent-2-soft)] to-transparent">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent-2)] mb-2">
                  Ready to send — download to attach
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={downloadDocx}
                    className="btn-cosmic inline-flex items-center gap-2 text-sm">
                    <FileDown size={15} /> Download .docx
                  </button>
                  <button onClick={downloadPdf}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[var(--accent-2)]/50 bg-[var(--bg-elev)] px-4 py-2.5 text-sm font-semibold text-[var(--fg)] hover:border-[var(--accent-2)] hover:bg-[var(--accent-2-soft)] transition-colors"
                    title="Opens a print preview — pick 'Save as PDF' to get a .pdf file">
                    <Printer size={15} /> Download .pdf
                  </button>
                </div>
              </div>
            )}

            {output && !busy && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 border-b border-[var(--border)]">
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] p-0.5">
                  {TABS.map(({ key, label, Icon, tip }) => (
                    <button
                      key={key}
                      onClick={() => setView(key)}
                      title={tip}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        view === key ? "bg-[var(--bg-elev)] text-[var(--fg)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--fg)]"
                      }`}
                    >
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button onClick={copy} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1 text-xs font-medium hover:border-[var(--accent-2)] inline-flex items-center gap-1">
                    <Copy size={12} /> {copied ? "Copied!" : "Copy"}
                  </button>
                  <button onClick={() => download("plain")} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1 text-xs font-medium hover:border-[var(--accent-2)] inline-flex items-center gap-1">
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
                    <p className="font-semibold">Generate failed</p>
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
                  <Loader2 size={16} className="animate-spin" /> Writing with Claude Sonnet…
                </div>
              ) : null}
            </div>

            <footer className="px-5 py-3 border-t border-[var(--border)] text-[10px] text-[var(--muted)]">
              Grounded in your base resume only — no invented experience, no recruiter-speak.
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
