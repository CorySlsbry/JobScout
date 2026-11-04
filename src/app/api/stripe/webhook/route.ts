// POST /api/stripe/webhook
//
// Signature-verified webhook from Stripe. Listens for subscription
// lifecycle events and mirrors them onto the User record (plan +
// subscription_status + period_end). This is the SOURCE OF TRUTH for
// tier — never trust the client.
//
// Setup in Stripe Dashboard:
//   Endpoint: https://<cloud-run-url>/api/stripe/webhook
//   Events: customer.subscription.created, customer.subscription.updated,
//           customer.subscription.deleted, checkout.session.completed
//   Copy the signing secret → STRIPE_WEBHOOK_SECRET env var.

import { NextResponse } from "next/server";
import { getStripe, mapSubscriptionStatus, planForStripePriceId } from "@/lib/stripe";
import { updateUser } from "@/lib/users";
import { getDb, COL } from "@/lib/firestore";
import { recordEvent } from "@/lib/events-log";
import { recordAudit } from "@/lib/audit-log";
import type Stripe from "stripe";
import type { User } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }
  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "verify_failed";
    return NextResponse.json({ error: "invalid_signature", detail: msg }, { status: 400 });
  }

  // ── Idempotency guard ──────────────────────────────────────────
  // Stripe will retry delivery on any non-2xx response, AND occasionally
  // duplicates a successful delivery during outages. Track processed event
  // ids in system_state/stripe_event_{id} so we don't double-apply MRR /
  // double-record audit entries on a replay.
  const db = getDb();
  if (db) {
    try {
      const evRef = db.collection(COL.systemState).doc(`stripe_event_${event.id}`);
      const seen = await evRef.get();
      if (seen.exists) {
        return NextResponse.json({ ok: true, idempotent_replay: true });
      }
      // Mark as processed BEFORE running the handler so a concurrent retry
      // doesn't sneak through. The handler is still allowed to throw — we
      // 500 below and Stripe retries; the marker is harmless to re-create.
      await evRef.set({ id: event.id, type: event.type, received_at: new Date().toISOString() });
    } catch (e) {
      console.warn("[stripe webhook] idempotency marker write failed; proceeding without:", e);
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, stripe);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
      default:
        // We ignore other events but still 200 — Stripe needs that to mark delivered.
        break;
    }
  } catch (err) {
    // Log + return 500 so Stripe retries. Clear the idempotency marker so
    // the retry actually runs the handler — otherwise we'd silently swallow.
    console.error("[stripe webhook] handler error:", err);
    if (db) {
      try { await db.collection(COL.systemState).doc(`stripe_event_${event.id}`).delete(); } catch {/* ignore */}
    }
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, stripe: Stripe) {
  const uid = (session.client_reference_id as string | undefined) ?? null;
  if (!uid) return;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await applySubscriptionToUser(uid, subscription);

  // Analytics + audit: paid customer landed. amount_total is in cents.
  void recordEvent({
    name: "checkout_completed",
    user_id: uid,
    props: {
      amount_cents: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
      subscription_id: subscriptionId,
    },
  });
  void recordAudit({
    action: "stripe.checkout_completed",
    actor_kind: "stripe",
    target_user_id: uid,
    target_resource: `subscription:${subscriptionId}`,
    payload: { amount_cents: session.amount_total ?? 0, currency: session.currency ?? "usd" },
  });
}

async function handleSubscriptionChange(sub: Stripe.Subscription) {
  // Resolve the uid. Two paths — sub.metadata.firebase_uid (set on create)
  // or via the customer's metadata (set when we made the Customer).
  let uid = (sub.metadata?.firebase_uid as string | undefined) ?? null;
  if (!uid) {
    uid = await uidForCustomer(typeof sub.customer === "string" ? sub.customer : sub.customer.id);
  }
  if (!uid) {
    console.warn("[stripe webhook] subscription event with no resolvable uid:", sub.id);
    return;
  }
  await applySubscriptionToUser(uid, sub);
}

async function applySubscriptionToUser(uid: string, sub: Stripe.Subscription) {
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const plan = planForStripePriceId(priceId);
  const status = mapSubscriptionStatus(sub.status);
  // Stripe gives us a Unix timestamp; convert to ISO.
  const periodEndSec = (sub as unknown as { current_period_end?: number }).current_period_end;
  const periodEnd = periodEndSec ? new Date(periodEndSec * 1000).toISOString() : null;
  // Persist the customer id from the subscription too — the checkout flow
  // normally sets it pre-checkout, but mirroring it here makes the webhook
  // self-sufficient (so the "Manage billing" portal button always has it,
  // even for subscriptions created out-of-band).
  const customerId = typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null);
  const patch: Partial<User> = {
    plan,
    stripe_subscription_id: sub.id,
    subscription_status: status,
    subscription_current_period_end: periodEnd,
  };
  if (customerId) patch.stripe_customer_id = customerId;
  await updateUser(uid, patch);
}

async function uidForCustomer(customerId: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const snap = await db.collection(COL.users).where("stripe_customer_id", "==", customerId).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}
