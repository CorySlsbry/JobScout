"use client";

// Settings card for billing. Shows current tier + upgrade / manage buttons.
// Server passes through whether Stripe is configured + the current plan
// (resolved from User record server-side, accounts for admin override).

import { useState } from "react";
import { CreditCard, Sparkles, Loader2, AlertCircle, Crown, Check, X, RotateCcw } from "lucide-react";
import type { UserPlan, SubscriptionStatus } from "@/lib/types";
import EmbeddedCheckoutPanel from "./EmbeddedCheckoutPanel";

export default function BillingCard({
  plan,
  status,
  periodEnd,
  hasCustomer,
  stripeConfigured,
  isAdmin,
}: {
  plan: UserPlan;
  status: SubscriptionStatus;
  periodEnd: string | null;
  hasCustomer: boolean;
  stripeConfigured: boolean;
  isAdmin: boolean;
}) {
  const [busy, setBusy] = useState<UserPlan | "portal" | "cancel" | "reactivate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Embedded Checkout — kept in-app instead of redirecting to checkout.stripe.com
  const [checkoutFor, setCheckoutFor] = useState<"pro" | "boost" | null>(null);

  function openCheckout(target: "pro" | "boost") {
    setError(null);
    setCheckoutFor(target);
  }

  async function openPortal() {
    setBusy("portal"); setError(null);
    try {
      const r = await fetch("/api/stripe/portal", { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.url) {
        setError((j as { help?: string; error?: string }).help ?? (j as { error?: string }).error ?? "portal_failed");
        return;
      }
      window.location.href = j.url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "portal_error");
    } finally { setBusy(null); }
  }

  async function cancelSub() {
    if (!confirm("Cancel your subscription? You'll keep access until the end of the current billing period.")) return;
    setBusy("cancel"); setError(null);
    try {
      const r = await fetch("/api/stripe/subscriptions/cancel", { method: "POST" });
      const j = await r.json();
      if (!r.ok) {
        setError((j as { help?: string; error?: string }).help ?? (j as { error?: string }).error ?? "cancel_failed");
        return;
      }
      // Refresh so the new state shows.
      window.location.reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "cancel_error");
    } finally { setBusy(null); }
  }

  async function reactivateSub() {
    setBusy("reactivate"); setError(null);
    try {
      const r = await fetch("/api/stripe/subscriptions/reactivate", { method: "POST" });
      const j = await r.json();
      if (!r.ok) {
        setError((j as { help?: string; error?: string }).help ?? (j as { error?: string }).error ?? "reactivate_failed");
        return;
      }
      window.location.reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "reactivate_error");
    } finally { setBusy(null); }
  }

  return (
    <section className="glass rounded-2xl p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)] flex items-center gap-1.5">
        <CreditCard size={12} /> Billing
      </h2>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)] p-3">
        <div className="flex items-center gap-2">
          <PlanBadge plan={plan} />
          <div className="text-sm">
            <p className="font-semibold">{planLabel(plan)} <span className="text-[var(--muted)] font-normal">{planPriceLabel(plan)}</span></p>
            <p className="text-[11px] text-[var(--muted)]">{statusLine(status, periodEnd, isAdmin)}</p>
          </div>
        </div>
        {hasCustomer && (
          <button onClick={openPortal} disabled={busy != null}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1 text-xs font-medium hover:border-[var(--accent-2)] disabled:opacity-50 inline-flex items-center gap-1">
            {busy === "portal" ? <Loader2 size={12} className="animate-spin" /> : null}
            Manage
          </button>
        )}
      </div>

      {!stripeConfigured && (
        <div className="mt-3 rounded-lg border border-[var(--warn)]/30 bg-[var(--warn-soft)] p-2.5 text-xs text-[var(--warn)] flex items-start gap-2">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>Stripe not configured. Set STRIPE_SECRET_KEY, STRIPE_PRICE_PRO, STRIPE_PRICE_BOOST, STRIPE_WEBHOOK_SECRET on Cloud Run.</span>
        </div>
      )}

      {!isAdmin && stripeConfigured && plan !== "boost" && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {plan === "free" && (
            <PlanCta
              tier="pro" priceLabel="$19/mo"
              perks={["Unlimited tailors + cover letters", "Upwork extension (score + draft + fill)", "Gmail inbox watcher (auto-pre-drafts)", "Assessments, stories, calibration"]}
              busy={busy === "pro"} onClick={() => openCheckout("pro")} />
          )}
          <PlanCta
            tier="boost" priceLabel="$29/mo"
            perks={[
              plan === "free" ? "Everything in Pro" : "Everything you have now",
              "Comp Intelligence (per-company benchmarks)",
              "Negotiation Playbook (one-tap offer prep)",
            ]}
            busy={busy === "boost"} onClick={() => openCheckout("boost")}
            primary={plan === "pro"} />
        </div>
      )}

      {/* Cancel / reactivate controls for active subscribers (non-admin) */}
      {!isAdmin && hasCustomer && (status === "active" || status === "trialing") && plan !== "free" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={cancelSub}
            disabled={busy != null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1 text-xs font-medium text-[var(--muted)] hover:border-[var(--bad)]/50 hover:text-[var(--bad)] disabled:opacity-50"
          >
            {busy === "cancel" ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            Cancel at period end
          </button>
          <p className="text-[11px] text-[var(--muted)]">Keeps access until {periodEnd ? new Date(periodEnd).toLocaleDateString() : "period close"}.</p>
        </div>
      )}
      {!isAdmin && hasCustomer && status === "canceled" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={reactivateSub}
            disabled={busy != null}
            className="btn-cosmic inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            {busy === "reactivate" ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
            Reactivate subscription
          </button>
          <p className="text-[11px] text-[var(--muted)]">Cancels the pending cancel — auto-renews again.</p>
        </div>
      )}

      {/* Embedded Stripe Checkout — full payment flow in an in-app modal */}
      {checkoutFor && (
        <EmbeddedCheckoutPanel
          plan={checkoutFor}
          onClose={() => setCheckoutFor(null)}
        />
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--bad)]/40 bg-[var(--bad-soft)] p-2.5 text-xs text-[var(--bad)]">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}

function PlanBadge({ plan }: { plan: UserPlan }) {
  if (plan === "boost") return <Crown size={22} className="text-[var(--accent-2)]" />;
  if (plan === "pro")   return <Sparkles size={22} className="text-[var(--accent-2)]" />;
  return <CreditCard size={22} className="text-[var(--muted)]" />;
}

function planLabel(plan: UserPlan): string {
  return plan === "boost" ? "Boost" : plan === "pro" ? "Pro" : "Free";
}
function planPriceLabel(plan: UserPlan): string {
  return plan === "boost" ? "· $29/mo" : plan === "pro" ? "· $19/mo" : "";
}
function statusLine(status: SubscriptionStatus, periodEnd: string | null, isAdmin: boolean): string {
  if (isAdmin) return "Admin · all features unlocked";
  if (status === "active" || status === "trialing") {
    if (!periodEnd) return "Active";
    return `Active · renews ${new Date(periodEnd).toLocaleDateString()}`;
  }
  if (status === "past_due") return "Past due — update payment to keep access";
  if (status === "canceled") return "Canceled — access ends at period close";
  if (status === "unpaid") return "Unpaid — access paused until resolved";
  if (status === "none") return "No subscription";
  return status;
}

function PlanCta({ tier, priceLabel, perks, busy, onClick, primary }: {
  tier: "pro" | "boost"; priceLabel: string; perks: string[]; busy: boolean; onClick: () => void; primary?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={busy}
      className={`text-left rounded-xl p-3 transition-colors disabled:opacity-50 ${
        primary
          ? "btn-cosmic"
          : "border border-[var(--border)] bg-[var(--bg-elev)] hover:border-[var(--accent-2)]"
      }`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold inline-flex items-center gap-1.5">
          {tier === "boost" ? <Crown size={14} /> : <Sparkles size={14} />} Upgrade to {tier === "boost" ? "Boost" : "Pro"}
        </span>
        <span className="text-xs">{priceLabel}</span>
      </div>
      <ul className="mt-2 space-y-0.5 text-[11px]">
        {perks.map((p) => (
          <li key={p} className="flex items-start gap-1.5">
            <Check size={10} className="mt-0.5 shrink-0 opacity-80" /> {p}
          </li>
        ))}
      </ul>
      {busy && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] opacity-80">
          <Loader2 size={11} className="animate-spin" /> Opening checkout…
        </p>
      )}
    </button>
  );
}
