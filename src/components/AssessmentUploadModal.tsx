"use client";

// Mobile-friendly upload modal for assessment results.
//
// Three input paths:
//   1. Camera/file (image: PNG/JPG, or PDF) — sent to /api/assessments/extract,
//      which uses Claude vision/document blocks to extract a structured summary.
//   2. Paste raw text — same extractor in text mode.
//   3. Manually compose the summary in markdown — power-user fallback.
//
// The modal shows the extracted summary for review/edit before saving.
// On mobile the file picker exposes the camera (`accept="image/*"`).

import { useRef, useState } from "react";
import { X, Upload, FileText, Camera, Loader2, AlertCircle, Check, Sparkles, ClipboardPaste } from "lucide-react";
import type { AssessmentKind } from "@/lib/types";

type Tab = "upload" | "paste" | "manual";

export default function AssessmentUploadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<Tab>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");

  const [previewMd, setPreviewMd] = useState<string>("");
  const [previewName, setPreviewName] = useState<string>("");
  const [previewSourceKind, setPreviewSourceKind] = useState<AssessmentKind>("paste");
  const [sourceFilename, setSourceFilename] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function runExtract() {
    setBusy(true); setError(null);
    try {
      let resp: Response;
      if (tab === "upload") {
        if (!file) { setError("Pick a screenshot or PDF first."); setBusy(false); return; }
        const fd = new FormData();
        fd.set("file", file);
        resp = await fetch("/api/assessments/extract", { method: "POST", body: fd });
      } else if (tab === "paste") {
        if (pasted.trim().length < 30) { setError("Paste at least 30 characters."); setBusy(false); return; }
        resp = await fetch("/api/assessments/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: pasted }),
        });
      } else {
        // manual — just take what's in the preview and skip extraction
        if (previewMd.trim().length < 20) { setError("Write a summary first."); setBusy(false); return; }
        if (!previewName.trim()) setPreviewName("Assessment result");
        setPreviewSourceKind("paste");
        setBusy(false);
        return;
      }
      const j = await resp.json();
      if (!resp.ok) {
        setError((j as { help?: string; error?: string }).help ?? (j as { error?: string }).error ?? "extract_failed");
        return;
      }
      setPreviewMd((j as { summary_md: string }).summary_md);
      setPreviewName((j as { suggested_name?: string }).suggested_name ?? "Assessment result");
      setPreviewSourceKind((j as { source_kind?: AssessmentKind }).source_kind ?? (tab === "paste" ? "text" : "paste"));
      setSourceFilename((j as { source_filename?: string }).source_filename ?? file?.name ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "fetch_error");
    } finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      const resp = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: previewName.trim() || "Assessment result",
          summary_md: previewMd.trim(),
          source_kind: previewSourceKind,
          source_filename: sourceFilename,
          source_url: sourceUrl.trim() || null,
          is_active: true,
        }),
      });
      const j = await resp.json();
      if (!resp.ok) {
        setError((j as { error?: string; detail?: string }).detail ?? (j as { error?: string }).error ?? "save_failed");
        return;
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "save_error");
    } finally { setBusy(false); }
  }

  const ready = previewMd.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-3 bg-black/70 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div onClick={(e) => e.stopPropagation()}
        className="glass relative w-full max-w-lg max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl"
        style={{ boxShadow: "var(--shadow-glow), var(--shadow-card)" }}>
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border)]">
          <h3 className="font-semibold flex items-center gap-2">
            <Sparkles size={15} className="text-[var(--accent-2)]" /> Add assessment
          </h3>
          <button onClick={onClose} disabled={busy} className="rounded-full p-1.5 text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-elev-2)] disabled:opacity-50">
            <X size={18} />
          </button>
        </header>

        <div className="px-5 pt-3">
          <div className="inline-flex w-full sm:w-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] p-0.5">
            {([
              { key: "upload", label: "Upload", Icon: Upload },
              { key: "paste",  label: "Paste",  Icon: ClipboardPaste },
              { key: "manual", label: "Manual", Icon: FileText },
            ] as Array<{ key: Tab; label: string; Icon: typeof Upload }>).map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
                  tab === key ? "bg-[var(--bg-elev)] text-[var(--fg)] shadow-sm" : "text-[var(--muted)]"
                }`}>
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-3 space-y-3 overflow-y-auto">
          {tab === "upload" && (
            <>
              <p className="text-xs text-[var(--muted)]">
                Snap a screenshot of your assessment result (phone or desktop), or pick a PDF.
                Claude vision extracts the tier, score, and feedback into a structured summary.
              </p>
              <div className="flex gap-2">
                <button onClick={() => fileRef.current?.click()}
                  className="flex-1 btn-cosmic inline-flex items-center justify-center gap-2 text-sm">
                  <Camera size={14} /> {file ? "Replace file" : "Pick / take photo"}
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
              {file && (
                <p className="text-[11px] text-[var(--muted)]">
                  Selected: <strong className="text-[var(--fg)]">{file.name}</strong> ({(file.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </>
          )}

          {tab === "paste" && (
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={6}
              placeholder="Paste assessment text or copy it from the result page…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 font-mono text-xs leading-relaxed focus:border-[var(--accent-2)] outline-none"
            />
          )}

          {tab === "manual" && (
            <p className="text-xs text-[var(--muted)]">Skip extraction — type the summary in markdown directly below.</p>
          )}

          {tab !== "manual" && (
            <button onClick={runExtract} disabled={busy || (tab === "upload" ? !file : pasted.trim().length < 30)}
              className="btn-cosmic w-full text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Extracting…</> : <><Sparkles size={14} /> Extract with Claude</>}
            </button>
          )}

          {previewMd && (
            <div className="mt-2 rounded-xl border border-[var(--good)]/30 bg-[var(--good-soft)] p-3 text-xs space-y-2">
              <div className="flex items-center gap-1.5 text-[var(--good)] font-semibold">
                <Check size={12} /> {tab === "manual" ? "Compose your summary" : "Extracted"}
              </div>
              <label className="block">
                <span className="block text-[10px] font-medium text-[var(--muted)] uppercase tracking-widest mb-1">Name</span>
                <input value={previewName} onChange={(e) => setPreviewName(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elev-2)] px-2 py-1 text-xs focus:border-[var(--accent-2)] outline-none" />
              </label>
              <label className="block">
                <span className="block text-[10px] font-medium text-[var(--muted)] uppercase tracking-widest mb-1">Summary (markdown)</span>
                <textarea value={previewMd} onChange={(e) => setPreviewMd(e.target.value)} rows={10}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elev-2)] px-2 py-1 font-mono text-[11px] leading-relaxed focus:border-[var(--accent-2)] outline-none" />
              </label>
              <label className="block">
                <span className="block text-[10px] font-medium text-[var(--muted)] uppercase tracking-widest mb-1">Source URL (optional)</span>
                <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elev-2)] px-2 py-1 text-xs focus:border-[var(--accent-2)] outline-none" />
              </label>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-[var(--bad)]/40 bg-[var(--bad-soft)] p-2.5 text-xs text-[var(--bad)]">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
          <button onClick={onClose} disabled={busy}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] px-4 py-2 text-xs font-medium hover:border-[var(--accent-2)] disabled:opacity-50">
            Cancel
          </button>
          <button onClick={save} disabled={busy || !ready}
            className="btn-cosmic text-xs disabled:opacity-50">
            {busy ? "Saving…" : "Save & make active →"}
          </button>
        </footer>
      </div>
    </div>
  );
}
