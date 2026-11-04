// POST /api/stripe/checkout
// Body: { plan: 'pro' | 'boost', returnUrl?: string }
// Returns: { url } — redirect the browser there.
//
// Creates (or reuses) a Stripe Customer for the signed-in user, opens a
// Subscription Checkout Session for the requested tier, and returns the
// hosted-checkout URL. The webhook does the actual tier flip on completion.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getStripe, stripePriceIdFor, isStripeConfigured } from "@/lib/stripe";
import { publicAppUrl } from "@/lib/url";
import { updateUser } from "@/lib/users";
import { recordEvent } from "@/lib/events-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  plan: z.enum(["pro", "boost"]),
  returnUrl: z.string().url().optional(),
  // When true, return a Checkout Session client_secret for in-app embedded
  // checkout rendering. Default (false) returns the hosted-checkout URL.
  embedded: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !user.record) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isStripeConfigured()) {
    return NextResponse.json({
      error: "stripe_not_configured",
      help: "Set STRIPE_SECRET_KEY, STRIPE_PRICE_PRO, STRIPE_PRICE_BOOST on Cloud Run.",
    }, { status: 503 });
  }
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });

  const priceId = stripePriceIdFor(body.plan);
  if (!priceId) {
    return NextResponse.json({ error: "no_price_for_plan", plan: body.plan }, { status: 400 });
  }

  // Reuse or create a Customer for this user. Persist the id on the User
  // record so the webhook can correlate events back to us.
  let customerId = user.record.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.record.email || user.email || undefined,
      name: user.record.display_name ?? user.name ?? undefined,
      metadata: { firebase_uid: user.uid },
    });
    customerId = customer.id;
    await updateUser(user.uid, { stripe_customer_id: customerId });
  }

  const baseUrl = publicAppUrl(req);
  const successUrl = body.returnUrl ?? `${baseUrl}/settings?billing=success`;
  const cancelUrl = `${baseUrl}/settings?billing=cancelled`;

  // Analytics breadcrumb fires for either mode.
  void recordEvent({
    name: "checkout_started",
    user_id: user.uid,
    plan: user.record.plan,
    props: { target_plan: body.plan, price_id: priceId, mode: body.embedded ? "embedded" : "hosted" },
  });

  if (body.embedded) {
    // Stripe Embedded Checkout — renders inside our page, never leaves the site.
    // The Stripe SDK's TS types in this version don't yet include ui_mode:
    // "embedded", but the API supports it. Cast-around once with a comment so
    // the next reader knows this is intentional.
    const sessionParams = {
      mode: "subscription" as const,
      ui_mode: "embedded" as const,
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: `${baseUrl}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      allow_promotion_codes: true,
      client_reference_id: user.uid,
      subscription_data: { metadata: { firebase_uid: user.uid } },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await stripe.checkout.sessions.create(sessionParams as any);
    return NextResponse.json({ ok: true, client_secret: session.client_secret });
  }

  // Hosted Checkout (default) — redirect-mode for back-compat.
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    client_reference_id: user.uid,
    subscription_data: { metadata: { firebase_uid: user.uid } },
  });
  return NextResponse.json({ ok: true, url: session.url });
}
