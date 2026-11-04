// Stripe SDK client + Price/tier mapping.
//
// We use Stripe Subscriptions in Checkout-redirect mode (simplest, no UI
// to maintain). On checkout completion + every subscription event the
// /api/stripe/webhook handler updates the user's plan/subscription_status.
//
// Env vars (Cloud Run):
//   STRIPE_SECRET_KEY              sk_test_... or sk_live_...
//   STRIPE_WEBHOOK_SECRET          whsec_... (from `stripe listen` or dashboard)
//   STRIPE_PRICE_PRO               price_... for $19/mo Pro recurring
//   STRIPE_PRICE_BOOST             price_... for $29/mo Boost recurring

import Stripe from "stripe";
import type { UserPlan } from "./types";

let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cached) {
    cached = new Stripe(key, {
      // Let the package pin the apiVersion it shipped with.
      typescript: true,
    });
  }
  return cached;
}

export function stripePriceIdFor(plan: Exclude<UserPlan, "free">): string | null {
  if (plan === "pro") return process.env.STRIPE_PRICE_PRO ?? null;
  if (plan === "boost") return process.env.STRIPE_PRICE_BOOST ?? null;
  return null;
}

// Reverse lookup — given a Stripe Price id, what plan does it grant?
export function planForStripePriceId(priceId: string | null | undefined): UserPlan {
  if (!priceId) return "free";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_BOOST) return "boost";
  return "free";
}

// Map Stripe's subscription.status string onto our SubscriptionStatus union.
// Stripe values: incomplete | incomplete_expired | trialing | active |
// past_due | canceled | unpaid | paused
export function mapSubscriptionStatus(status: string | null | undefined): import("./types").SubscriptionStatus {
  switch (status) {
    case "active":               return "active";
    case "trialing":             return "trialing";
    case "past_due":             return "past_due";
    case "canceled":             return "canceled";
    case "unpaid":               return "unpaid";
    case "incomplete":           return "incomplete";
    case "incomplete_expired":   return "incomplete_expired";
    case "paused":               return "canceled";   // collapse paused → canceled in our model
    default:                     return "none";
  }
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRICE_PRO && !!process.env.STRIPE_PRICE_BOOST;
}
