"use client";

// Admin-only settings card. Generates the bearer token that the Chrome
// extension uses to call /api/upwork/score and /api/upwork/draft-bid.
// Plaintext is returned ONCE — we only ever store its sha256 hash.

import { useState } from "react";
import { KeyRound, Copy, RotateCcw, AlertTriangle, Trash2 } from "lucide-react";

export default function ExtensionCard({ hasToken, createdAt }: { hasToken: boolean; createdAt: string | null }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "revoke" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stillHasToken, setStillHasToken] = useState(hasToken);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy("create"); setErr(null);
    try {
      const r = await fetch("/api/profile/extension-token", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "failed");
      setToken(j.token);
      setStillHasToken(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally { setBusy(null); }
  }

  async function revoke() {
    if (!confirm("Revoke this token? Your extension will stop working until you generate + paste a new one.")) return;
    setBusy("revoke"); setErr(null);
    try {
      const r = await fetch("/api/profile/extension-token", { method: "DELETE" });
      if (!r.ok) throw new Error("revoke_failed");
      setToken(null);
      setStillHasToken(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally { setBusy(null); }
  }

  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="glass rounded-2xl p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)] flex items-center gap-1.5">
        <KeyRound size={12} /> Browser extension
      </h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Generate a token, paste it into the JobScout Chrome extension. Press
        <kbd className="mx-1 rounded bg-[var(--bg-elev-2)] border border-[var(--border)] px-1 text-[10px]">Alt+Shift+J</kbd>
        on any Upwork job page to score it against your resume and draft a proposal.
      </p>

      {token && (
        <div className="mt-3 rounded-xl border border-[var(--accent-2)]/50 bg-[var(--accent-2-soft)] p-3 text-sm space-y-2">
          <p className="font-semibold text-[var(--accent-2)] flex items-center gap-1.5">
            <AlertTriangle size={14} /> Copy this now — it&apos;s only shown once.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded-md bg-[var(--bg-elev-2)] px-2 py-1.5 font-mono text-xs">{token}</code>
            <button onClick={copyToken}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1.5 text-xs font-medium hover:border-[var(--accent-2)]">
              <Copy size={12} /> {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-[11px] text-[var(--muted)]">
            Paste into the extension popup. We store only a hash — if you lose this you must generate a new one.
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={generate} disabled={!!busy}
          className="btn-cosmic inline-flex items-center gap-1.5 text-sm disabled:opacity-50">
          <RotateCcw size={13} /> {stillHasToken ? "Rotate token" : "Generate token"}
        </button>
        {stillHasToken && (
          <button onClick={revoke} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--bad)]/40 bg-[var(--bg-elev)] px-3 py-2 text-sm font-medium text-[var(--bad)] hover:bg-[var(--bad-soft)] disabled:opacity-50">
            <Trash2 size={13} /> Revoke
          </button>
        )}
        {createdAt && !token && (
          <span className="text-[11px] text-[var(--muted)]">Active since {fmt(createdAt)}</span>
        )}
      </div>

      {err && <p className="mt-2 text-xs text-[var(--bad)]">{err}</p>}
    </section>
  );
}

function fmt(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}
