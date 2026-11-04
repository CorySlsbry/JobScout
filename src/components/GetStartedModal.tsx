"use client";

// Sabrina's "delay-the-form" pattern: button-triggered modal, opt-in minimalism.
// Only one input (email) + one button. Refer-2-for-20%-off mention seals the deal.

import { useState, useTransition } from "react";
import { X, Mail, Check } from "lucide-react";

export function GetStartedModal({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    start(async () => {
      // Stub: persist via /api/waitlist later (Firebase Auth will replace).
      try {
        await fetch("/api/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }).catch(() => {});
      } catch {}
      setDone(true);
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-cosmic">
        {children ?? "Start free →"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass relative w-full max-w-md rounded-3xl p-6 sm:p-8"
            style={{ boxShadow: "var(--shadow-glow), var(--shadow-card)" }}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-elev-2)]"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            {!done ? (
              <>
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">
                  <span aria-hidden>✦</span> Free, 60 sec setup
                </div>
                <h2 className="font-[family-name:var(--font-inter-tight)] text-2xl font-bold tracking-tight">
                  Get the next $150k+ remote job <span className="grad-text">before LinkedIn does</span>.
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Drop your email — we&apos;ll text you the moment a perfect match posts. No spam, no resume yet, no payment.
                </p>

                <form onSubmit={submit} className="mt-5 space-y-3">
                  <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-3 focus-within:border-[var(--accent-2)]">
                    <Mail size={18} className="text-[var(--muted)] shrink-0" />
                    <input
                      type="email"
                      required
                      autoFocus
                      placeholder="person1@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="flex-1 bg-transparent outline-none placeholder:text-[var(--muted)]"
                    />
                  </label>
                  <button type="submit" disabled={busy} className="btn-cosmic w-full disabled:opacity-50">
                    {busy ? "Sending…" : "Get me on the list →"}
                  </button>
                </form>

                <p className="mt-4 text-xs text-[var(--muted)] leading-relaxed">
                  ★ <strong className="text-[var(--fg)]">Refer 2 friends</strong> who join, get <strong className="text-[var(--fg)]">20% off Pro for life</strong>. We&apos;ll send your link after sign-up.
                </p>
              </>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded-full bg-[var(--good-soft)] p-2">
                    <Check size={20} className="text-[var(--good)]" />
                  </span>
                  <h2 className="font-[family-name:var(--font-inter-tight)] text-xl font-bold">You&apos;re on the list.</h2>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  We&apos;ll email <strong className="text-[var(--fg)]">{email}</strong> with your invite + your refer-2-for-20%-off link the moment we open seats. Meanwhile, take a look at the live demo:
                </p>
                <a href="/feed" className="btn-cosmic mt-5 inline-block">Open the demo feed →</a>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
