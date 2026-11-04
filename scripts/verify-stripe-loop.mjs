// End-to-end verification of the Stripe money loop, TEST mode.
//
// Proves: subscription created → Stripe sends a real signed webhook to the
// PROD endpoint → our handler verifies the signature, resolves the uid, and
// flips the user's Firestore record to plan=pro / status=active.
//
// Self-cleaning: cancels the sub, deletes the customer, deletes the test user.
//
// Usage: STRIPE_SK=sk_test_... PRO_PRICE=price_... node scripts/verify-stripe-loop.mjs

import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const SK = process.env.STRIPE_SK;
const PRO_PRICE = process.env.PRO_PRICE;
if (!SK || !PRO_PRICE) { console.error("Need STRIPE_SK + PRO_PRICE env vars"); process.exit(1); }

if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: "jobscout-app" });
const db = getFirestore();

const TEST_UID = "stripe_verify_" + Date.now().toString(36);
const STRIPE = "https://api.stripe.com/v1";

async function stripe(path, method = "GET", form = null) {
  const body = form
    ? new URLSearchParams(form).toString()
    : undefined;
  const res = await fetch(`${STRIPE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SK}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${method} ${path} → ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let customerId, subId;
try {
  console.log(`Test uid: ${TEST_UID}`);

  // 1. Seed a minimal free user doc (the webhook updates it by uid).
  const now = new Date().toISOString();
  await db.collection("users").doc(TEST_UID).set({
    id: TEST_UID, email: `${TEST_UID}@stripe-verify.test`, display_name: "Stripe Verify",
    role: "user", plan: "free", subscription_status: "none",
    stripe_customer_id: null, stripe_subscription_id: null,
    refer_code: "VERIFY", referred_by_code: null, referral_count: 0,
    onboarded: true, created_at: now, last_seen_at: now,
  });
  console.log("1. Seeded users/" + TEST_UID + " as plan=free ✓");

  // 2. Create customer + attach Stripe's test card pm.
  const customer = await stripe("/customers", "POST", { "metadata[firebase_uid]": TEST_UID, email: `${TEST_UID}@stripe-verify.test` });
  customerId = customer.id;
  const attached = await stripe(`/payment_methods/pm_card_visa/attach`, "POST", { customer: customerId });
  await stripe(`/customers/${customerId}`, "POST", { "invoice_settings[default_payment_method]": attached.id });
  console.log("2. Created customer " + customerId + " + attached " + attached.id + " ✓");

  // 3. Create the subscription on the Pro price — fires customer.subscription.created.
  const sub = await stripe("/subscriptions", "POST", {
    customer: customerId,
    "items[0][price]": PRO_PRICE,
    "metadata[firebase_uid]": TEST_UID,
  });
  subId = sub.id;
  console.log(`3. Created subscription ${subId} status=${sub.status} → webhook should fire ✓`);

  // 4. Poll the user doc for the webhook-driven flip to pro/active.
  let flipped = null;
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    const snap = await db.collection("users").doc(TEST_UID).get();
    const u = snap.data() ?? {};
    if (u.plan === "pro" && (u.subscription_status === "active" || u.subscription_status === "trialing")) {
      flipped = u; break;
    }
    process.stdout.write(`   poll ${i + 1}/15: plan=${u.plan} status=${u.subscription_status}\n`);
  }

  if (flipped) {
    console.log(`\n✅ MONEY LOOP VERIFIED: webhook flipped user to plan=${flipped.plan}, status=${flipped.subscription_status}`);
    console.log(`   stripe_customer_id=${flipped.stripe_customer_id ? "set" : "MISSING"}, stripe_subscription_id=${flipped.stripe_subscription_id ? "set" : "MISSING"}`);
  } else {
    const snap = await db.collection("users").doc(TEST_UID).get();
    console.log(`\n❌ NOT FLIPPED after 30s. Final state: ${JSON.stringify(snap.data())}`);
    console.log("   (Check the webhook is reaching prod + STRIPE_WEBHOOK_SECRET matches.)");
  }
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  // 5. Cleanup — always run.
  console.log("\nCleanup:");
  try { if (subId) { await stripe(`/subscriptions/${subId}`, "DELETE"); console.log("  canceled sub ✓"); } } catch (e) { console.log("  sub cancel:", e.message); }
  try { if (customerId) { await stripe(`/customers/${customerId}`, "DELETE"); console.log("  deleted customer ✓"); } } catch (e) { console.log("  customer del:", e.message); }
  try { await db.collection("users").doc(TEST_UID).delete(); console.log("  deleted test user doc ✓"); } catch (e) { console.log("  user del:", e.message); }
  process.exit(0);
}
