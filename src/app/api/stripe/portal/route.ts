// POST /api/stripe/portal
// Returns: { url } → Stripe Billing Portal redirect (cancel, update card,
// switch plan, view invoices). One-click for the user, zero UI to maintain.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { publicAppUrl } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !user.record) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });

  const customerId = user.record.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json({
      error: "no_stripe_customer",
      help: "Subscribe first to get a Stripe customer record.",
    }, { status: 422 });
  }

  const baseUrl = publicAppUrl(req);
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/settings`,
  });

  return NextResponse.json({ ok: true, url: portal.url });
}
