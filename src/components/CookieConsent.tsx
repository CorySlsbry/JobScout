"use client";

// EU cookie consent banner. Slim, dismissible, sets a one-year localStorage
// flag so it doesn't reappear. We don't actually need consent for the strictly-
// necessary jobscout_session cookie, but explicit acknowledgement is best
// practice + keeps procurement happy.

import { useEffect, useState } from "react";
import { Cookie, X } from "lucide-react";
import Link from "next/link";

const KEY = "jbsk_cookie_ack_v1";
const TTL_MS = 365 * 24 * 60 * 60 * 1000;  // 1 year

export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        // Slight delay so the banner doesn't pop before the page settles
        const t = setTimeout(() => setShow(true), 600);
        return () => clearTimeout(t);
      }
      const parsed = JSON.parse(raw) as { acked_at?: number };
      if (!parsed.acked_at || Date.now() - parsed.acked_at > TTL_MS) {
        setShow(true);
      }
    } catch {
      setShow(true);
    }
  }, []);

  function ack() {
    try { localStorage.setItem(KEY, JSON.stringify({ acked_at: Date.now() })); } catch {/* ignore */}
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl"
    >
      <div className="glass rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start gap-3" style={{ boxShadow: "var(--shadow-glow), var(--shadow-card)" }}>
        <div className="rounded-xl bg-[var(--bg-elev-2)] p-2 border border-[var(--border)] shrink-0">
          <Cookie size={18} className="text-[var(--accent-2)]" />
        </div>
        <div className="flex-1 text-sm">
          <p className="font-semibold leading-snug">A note about cookies</p>
          <p className="mt-1 text-[var(--muted)] leading-relaxed text-xs sm:text-sm">
            JobScout uses a session cookie to keep you signed in and a localStorage entry for anonymous analytics (session id + last-seen page). No third-party trackers ride on this domain. Details in our{" "}
            <Link href="/privacy" className="text-[var(--accent-2)] underline">privacy policy</Link>.
          </p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            onClick={ack}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-xs font-semibold hover:border-[var(--accent-2)]"
          >
            Got it
          </button>
          <button onClick={ack} aria-label="Dismiss" className="text-[var(--muted)] hover:text-[var(--fg)] p-1">
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
