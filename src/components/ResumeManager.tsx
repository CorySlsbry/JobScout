"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Upload, FileText, Trash2, Star, StarOff, Pencil, Check, X, Loader2,
  AlertCircle, ClipboardPaste, FileType,
} from "lucide-react";
import type { Resume, ResumeKind } from "@/lib/types";
import { parseResumeFile, ACCEPT_MIME, MAX_BYTES } from "@/lib/resume-parse";

const KIND_ICON: Record<ResumeKind, typeof FileText> = {
  paste: ClipboardPaste,
  pdf:   FileType,
  docx:  FileType,
  md:    FileText,
  txt:   FileText,
};

const KIND_LABEL: Record<ResumeKind, string> = {
  paste: "Pasted",
  pdf:   "PDF",
  docx:  "DOCX",
  md:    "Markdown",
  txt:   "TXT",
};

export default function ResumeManager({ initial }: { initial: Resume[] }) {
  const [resumes, setResumes] = useState<Resume[]>(initial);
  const [adding, setAdding] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const r = await fetch("/api/resumes");
    if (r.ok) {
      const j = await r.json() as { resumes: Resume[] };
      setResumes(j.resumes);
    }
  }

  function setActive(id: string) {
    startTransition(async () => {
      const r = await fetch(`/api/resumes/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setActive: true }),
      });
      if (r.ok) await refresh();
    });
  }

  function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    startTransition(async () => {
      const r = await fetch(`/api/resumes/${id}`, { method: "DELETE" });
      if (r.ok) await refresh();
      else setMsg("Could not delete.");
    });
  }

  function startRename(r: Resume) {
    setRenamingId(r.id);
    setRenameValue(r.name);
  }
  function commitRename(id: string) {
    const name = renameValue.trim();
    if (!name) { setRenamingId(null); return; }
    startTransition(async () => {
      await fetch(`/api/resumes/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await refresh();
      setRenamingId(null);
    });
  }

  return (
    <section className="glass rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Resumes</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Upload a PDF / DOCX / MD / TXT, or paste markdown. The <strong className="text-[var(--fg)]">active</strong> resume powers the &quot;Tailor my resume&quot; and cover letter buttons.
          </p>
        </div>
        <button onClick={() => setAdding(true)}
          className="btn-cosmic text-xs inline-flex items-center gap-1.5 shrink-0">
          <Upload size={13} /> Add
        </button>
      </div>

      {resumes.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
          No resumes yet. <button onClick={() => setAdding(true)} className="underline decoration-[var(--accent-2)]/40 hover:decoration-[var(--accent-2)]">Add your first one</button> — drag a PDF, paste markdown, anything.
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {resumes.map((r) => {
            const Icon = KIND_ICON[r.source_kind] ?? FileText;
            const isRenaming = renamingId === r.id;
            return (
              <li key={r.id} className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                r.is_active
                  ? "border-[var(--accent-2)]/40 bg-[var(--accent-2-soft)]"
                  : "border-[var(--border)] bg-[var(--bg-elev-2)]"
              }`}>
                <Icon size={18} className={r.is_active ? "text-[var(--accent-2)]" : "text-[var(--muted)]"} />
                <div className="flex-1 min-w-0">
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(r.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => commitRename(r.id)}
                      className="w-full bg-transparent border-b border-[var(--accent-2)] outline-none text-sm font-semibold"
                    />
                  ) : (
                    <button
                      onClick={() => startRename(r)}
                      className="block w-full text-left text-sm font-semibold truncate hover:text-[var(--accent-2)] transition-colors"
                      title="Click to rename"
                    >
                      {r.name}
                    </button>
                  )}
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                    <span>{KIND_LABEL[r.source_kind]}</span>
                    <span>·</span>
                    <span>{(r.content_md.length / 1000).toFixed(1)}k chars</span>
                    {r.source_filename && <><span>·</span><span className="truncate">{r.source_filename}</span></>}
                    <span>·</span>
                    <span>{formatDate(r.created_at)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!r.is_active && (
                    <button
                      onClick={() => setActive(r.id)}
                      disabled={pending}
                      title="Make this the active resume"
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-1.5 text-[var(--muted)] hover:text-[var(--accent-2)] hover:border-[var(--accent-2)]/40 disabled:opacity-50"
                    >
                      <StarOff size={14} />
                    </button>
                  )}
                  {r.is_active && (
                    <span className="rounded-lg bg-[var(--accent-2)]/15 p-1.5 text-[var(--accent-2)]" title="Active">
                      <Star size={14} fill="currentColor" />
                    </span>
                  )}
                  <button
                    onClick={() => startRename(r)}
                    title="Rename"
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-1.5 text-[var(--muted)] hover:text-[var(--fg)]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => remove(r.id, r.name)}
                    disabled={pending}
                    title="Delete"
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-1.5 text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/40 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {msg && <p className="mt-3 text-xs text-[var(--bad)]">{msg}</p>}

      {adding && <AddResumeModal onClose={() => setAdding(false)} onAdded={() => { void refresh(); setAdding(false); }} />}
    </section>
  );
}

function AddResumeModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [name, setName] = useState("");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsedMd, setParsedMd] = useState<string | null>(null);
  const [parsedKind, setParsedKind] = useState<ResumeKind | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Parse the selected file. Synchronous resets (parsing/error/parsedMd) happen
  // in the file-set handlers below, not here — React 19's set-state-in-effect
  // rule wants us to compute or schedule, not directly setState in the effect body.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    parseResumeFile(file)
      .then(({ md, kind }) => {
        if (cancelled) return;
        setParsedMd(md);
        setParsedKind(kind);
        if (!name) setName(suggestName(file.name));
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "parse_failed"); })
      .finally(() => { if (!cancelled) setParsing(false); });
    return () => { cancelled = true; };
  }, [file, name]);

  /** Atomic file-state reset + new-file selection. */
  function selectFile(f: File) {
    setError(null);
    setParsedMd(null);
    setParsing(true);
    setFile(f);
  }

  async function submit() {
    setError(null);
    let content_md = "";
    let kind: ResumeKind = "paste";
    let filename: string | null = null;
    if (tab === "upload") {
      if (!parsedMd || !parsedKind) { setError("Pick a file first."); return; }
      content_md = parsedMd;
      kind = parsedKind;
      filename = file?.name ?? null;
    } else {
      content_md = pasted.trim();
      kind = "paste";
      if (content_md.length < 50) { setError("Paste at least 50 chars of resume content."); return; }
    }
    const finalName = name.trim() || (filename ? suggestName(filename) : "Untitled resume");

    setBusy(true);
    try {
      const r = await fetch("/api/resumes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: finalName, content_md, source_kind: kind, source_filename: filename, setActive: true }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError((j as { detail?: string }).detail ?? "save_failed");
        return;
      }
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="glass relative w-full max-w-lg rounded-3xl flex flex-col"
        style={{ boxShadow: "var(--shadow-glow), var(--shadow-card)" }}>
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border)]">
          <h3 className="font-semibold">Add a resume</h3>
          <button onClick={onClose} disabled={busy} className="rounded-full p-1.5 text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-elev-2)] disabled:opacity-50">
            <X size={18} />
          </button>
        </header>

        <div className="px-5 pt-3">
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] p-0.5">
            <button onClick={() => setTab("upload")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                tab === "upload" ? "bg-[var(--bg-elev)] text-[var(--fg)] shadow-sm" : "text-[var(--muted)]"
              }`}>
              <Upload size={12} /> Upload file
            </button>
            <button onClick={() => setTab("paste")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                tab === "paste" ? "bg-[var(--bg-elev)] text-[var(--fg)] shadow-sm" : "text-[var(--muted)]"
              }`}>
              <ClipboardPaste size={12} /> Paste markdown
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          {tab === "upload" ? (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) selectFile(f);
                }}
                className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
                  dragOver ? "border-[var(--accent-2)] bg-[var(--accent-2-soft)]" : "border-[var(--border)] hover:border-[var(--accent-2)]/50"
                }`}
              >
                <Upload size={28} className="mx-auto text-[var(--muted)]" />
                <p className="mt-2 text-sm font-medium">{file ? file.name : "Drop a file here, or click to browse"}</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">PDF, DOCX, MD, TXT · ≤ {(MAX_BYTES / 1024 / 1024).toFixed(0)} MB</p>
                <input ref={fileRef} type="file" accept={ACCEPT_MIME} className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) selectFile(f); }} />
              </div>
              {parsing && (
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <Loader2 size={14} className="animate-spin" /> Parsing…
                </div>
              )}
              {parsedMd && !parsing && (
                <div className="rounded-xl border border-[var(--good)]/30 bg-[var(--good-soft)] p-3 text-xs text-[var(--good)] flex items-start gap-2">
                  <Check size={14} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Parsed {parsedKind?.toUpperCase()} ({(parsedMd.length / 1000).toFixed(1)}k chars)</p>
                    <p className="text-[var(--muted)] mt-0.5">First line: <span className="text-[var(--fg)]">{parsedMd.split("\n")[0].slice(0, 80)}…</span></p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={10}
              placeholder="# Your Name&#10;Title · location · email&#10;&#10;## Professional Summary&#10;…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 font-mono text-xs leading-relaxed focus:border-[var(--accent-2)] outline-none"
            />
          )}

          <label className="block">
            <span className="block text-xs font-medium text-[var(--muted)] mb-1">Name (so you can pick between versions later)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Solutions Architect, Tesla resume, …"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-sm focus:border-[var(--accent-2)] outline-none"
            />
          </label>

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
          <button onClick={submit}
            disabled={busy || (tab === "upload" ? !parsedMd : pasted.trim().length < 50)}
            className="btn-cosmic text-xs disabled:opacity-50">
            {busy ? "Saving…" : "Save & make active →"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function suggestName(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 100) || "Resume";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 30) return `${Math.round(days)}d ago`;
  return d.toLocaleDateString();
}
