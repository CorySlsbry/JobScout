"use client";

// Settings → Account → Danger Zone. Two actions: export all my data (GET),
// permanently delete account (POST with typed confirmation).

import { useState } from "react";
import { Download, AlertOctagon, Loader2 } from "lucide-react";

export default function AccountDangerZone({ email }: { email: string | null }) {
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  async function doExport() {
    setBusy("export"); setError(null);
    try {
      // Use a hidden anchor download so the JSON streams direct to disk
      const res = await fetch("/api/account/export", { credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(`Export failed: ${j.error ?? res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Server sets filename in Content-Disposition; for our purposes blob fallback is fine.
      a.download = `jobscout-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "export_error");
    } finally {
      setBusy(null);
    }
  }

  async function doDelete() {
    if (confirmText !== "DELETE") {
      setError('Type DELETE in capital letters to confirm.');
      return;
    }
    setBusy("delete"); setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(`Delete failed: ${j.error ?? res.status}. ${j.help ?? ""}`);
        return;
      }
      // Bye. Send them home.
      window.location.href = "/?account_deleted=1";
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete_error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--bad)]/30 bg-[var(--bad-soft)]/30 p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--bad)] flex items-center gap-1.5">
        <AlertOctagon size={12} /> Danger zone
      </h2>

      <div>
        <p className="font-semibold text-sm">Download my data</p>
        <p className="text-xs text-[var(--muted)] mt-0.5">
          Single JSON file with your profile, applications, resumes, stories, assessments, Upwork leads, and feedback. Sensitive Stripe ids are stripped.
        </p>
        <button
          onClick={doExport}
          disabled={busy != null}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--accent-2)] disabled:opacity-50"
        >
          {busy === "export" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          {busy === "export" ? "Preparing…" : "Export my data"}
        </button>
      </div>

      <div className="pt-3 border-t border-[var(--bad)]/30">
        <p className="font-semibold text-sm text-[var(--bad)]">Delete my account</p>
        <p className="text-xs text-[var(--muted)] mt-0.5">
          Permanent. Wipes your profile, applications, resumes, stories, assessments, Upwork leads, feedback, and analytics events. Stripe subscription cancels at period end. Firebase Auth user removed. This action cannot be undone.
        </p>
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--bad)]/40 bg-transparent px-3 py-1.5 text-xs font-semibold text-[var(--bad)] hover:bg-[var(--bad-soft)]"
          >
            <AlertOctagon size={12} /> I want to delete my account
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-[var(--muted)]">
              Type <code className="bg-[var(--bg-elev-2)] rounded px-1 py-0.5 font-mono font-bold">DELETE</code> to confirm.
              {email && <> Your email <span className="text-[var(--fg)]">{email}</span> will be removed from Firebase Auth and can&apos;t be recovered.</>}
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--bad)]"
              autoCapitalize="characters"
              autoComplete="off"
            />
            <div className="flex gap-2">
              <button
                onClick={doDelete}
                disabled={busy != null || confirmText !== "DELETE"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--bad)] text-white px-3 py-1.5 text-xs font-bold hover:opacity-90 disabled:opacity-50"
              >
                {busy === "delete" ? <Loader2 size={12} className="animate-spin" /> : <AlertOctagon size={12} />}
                {busy === "delete" ? "Deleting…" : "Permanently delete account"}
              </button>
              <button
                onClick={() => { setShowConfirm(false); setConfirmText(""); setError(null); }}
                className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-1.5 text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-[var(--bad)] bg-[var(--bad-soft)] rounded-lg p-2.5 border border-[var(--bad)]/40">
          {error}
        </p>
      )}
    </section>
  );
}
