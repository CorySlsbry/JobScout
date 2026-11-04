"use client";

// Stripe Embedded Checkout panel — renders the full payment flow inline so
// users never leave JobScout to subscribe. Replaces the old redirect-to-stripe
// flow used by BillingCard.
//
// Usage:
//   <EmbeddedCheckoutPanel plan="pro" onClose={() => setOpen(false)} />
//
// On successful payment Stripe calls our /api/stripe/webhook (which flips
// User.plan) AND redirects the iframe to /settings?billing=success&session_id=...
// We listen for that redirect via the onComplete prop.

import { useCallback, useEffect, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { Loader2, X, AlertOctagon } from "lucide-react";

// Singleton — Stripe.js is loaded once per page and reused across mounts.
let cachedStripe: Promise<Stripe | null> | null = null;
function stripeJs(): Promise<Stripe | null> {
  if (!cachedStripe) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    cachedStripe = key ? loadStripe(key) : Promise.resolve(null);
  }
  return cachedStripe;
}

export default function EmbeddedCheckoutPanel({
  plan,
  onClose,
}: {
  plan: "pro" | "boost";
  onClose: () => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch a fresh client secret on mount. We use useCallback so the fetcher
  // can be passed to EmbeddedCheckoutProvider as the `fetchClientSecret` arg —
  // that pattern is required so Stripe can re-fetch on internal navigation.
  const fetchClientSecret = useCallback(async (): Promise<string> => {
    const r = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ plan, embedded: true }),
    });
    const j = await r.json();
    if (!r.ok || !j.client_secret) {
      throw new Error(j.error ?? j.help ?? "checkout_session_failed");
    }
    return j.client_secret as string;
  }, [plan]);

  useEffect(() => {
    // Pre-fetch once to detect errors early and to show our own UI state.
    fetchClientSecret()
      .then((cs) => setClientSecret(cs))
      .catch((e: Error) => setError(e.message));
  }, [fetchClientSecret]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="glass relative w-full max-w-2xl rounded-3xl my-8"
        style={{ boxShadow: "var(--shadow-glow), var(--shadow-card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">
              Upgrade to {plan === "boost" ? "Boost" : "Pro"}
            </p>
            <h2 className="font-[family-name:var(--font-inter-tight)] mt-1 text-xl font-bold tracking-tight">
              {plan === "boost" ? "$29/mo" : "$19/mo"} · cancel any time
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close checkout"
            className="rounded-full p-2 text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-elev-2)]"
          >
            <X size={18} />
          </button>
        </header>

        <div className="p-2 sm:p-4 min-h-[500px]">
          {error ? (
            <div className="m-4 rounded-2xl border border-[var(--bad)]/40 bg-[var(--bad-soft)] p-5 text-sm">
              <p className="flex items-center gap-2 font-semibold text-[var(--bad)]">
                <AlertOctagon size={16} /> Couldn&apos;t open checkout
              </p>
              <p className="mt-2 text-[var(--muted)]">{error}</p>
            </div>
          ) : !clientSecret ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-[var(--muted)]">
              <Loader2 size={28} className="animate-spin" />
              <p className="mt-3 text-sm">Opening secure checkout…</p>
            </div>
          ) : (
            <EmbeddedCheckoutProvider stripe={stripeJs()} options={{ fetchClientSecret: () => Promise.resolve(clientSecret) }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </div>
      </div>
    </div>
  );
}
