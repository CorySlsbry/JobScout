// POST /api/stripe/subscriptions/cancel
//
// Cancels the user's active subscription at period end. Their access remains
// until subscription_current_period_end; after that the Stripe webhook flips
// them to plan=free.
//
// This is "soft cancel" — they keep paid features until they paid for. To
// hard-cancel immediately use the customer portal. We don't expose that
// directly because immediate cancel + proration is messier UX.

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
    return NextResponse.json({ error: "no_active_subscription" }, { status: 400 });
  }

  try {
    const updated = await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    void recordEvent({ name: "subscription_cancel_scheduled", user_id: user.uid, plan: user.record.plan });
    void recordAudit({
      action: "stripe.subscription_cancel_scheduled",
      actor_kind: "user",
      actor_id: user.uid,
      actor_email: user.email,
      target_user_id: user.uid,
      target_resource: `subscription:${subId}`,
      payload: { current_period_end: (updated as unknown as { current_period_end?: number }).current_period_end },
      note: "User-initiated soft cancel — keeps access until period end",
    });
    return NextResponse.json({
      ok: true,
      cancel_at_period_end: true,
      access_until: user.record.subscription_current_period_end,
    });
  } catch (e) {
    return NextResponse.json({
      error: "stripe_call_failed",
      help: e instanceof Error ? e.message.slice(0, 200) : "unknown",
    }, { status: 502 });
  }
}
