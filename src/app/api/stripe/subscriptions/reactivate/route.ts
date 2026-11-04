// POST /api/stripe/subscriptions/reactivate
//
// Undoes a pending cancel. If the subscription has `cancel_at_period_end=true`,
// flip it back to false so it auto-renews. Only works while still inside the
// paid period — once the period ends and Stripe actually cancels, the user
// needs to start a fresh checkout instead.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { recordAudit } from "@/lib/audit-log";
import { recordEvent } from "@/lib/events-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSessionUser();
  if (!user || !user.record) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isStripeConfigured()) return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });

  const stripe = getStripe();
  const subId = user.record.stripe_subscription_id;
  if (!stripe || !subId) {
    return NextResponse.json({ error: "no_subscription_to_reactivate" }, { status: 400 });
  }

  try {
    await stripe.subscriptions.update(subId, { cancel_at_period_end: false });
    void recordEvent({ name: "subscription_reactivated", user_id: user.uid, plan: user.record.plan });
    void recordAudit({
      action: "stripe.subscription_reactivated",
      actor_kind: "user",
      actor_id: user.uid,
      actor_email: user.email,
      target_user_id: user.uid,
      target_resource: `subscription:${subId}`,
      note: "User reactivated a pending-cancel subscription",
    });
    return NextResponse.json({ ok: true, cancel_at_period_end: false });
  } catch (e) {
    return NextResponse.json({
      error: "stripe_call_failed",
      help: e instanceof Error ? e.message.slice(0, 200) : "unknown",
    }, { status: 502 });
  }
}
