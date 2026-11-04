// /admin/billing — Stripe-aware billing dashboard.
//
// Today's view is "what we know from the users collection" — plan distribution
// and computed MRR. The full Stripe view (live subscription list, MRR by month,
// churn rate, failed payments) is implemented post-Phase-1B, once we have
// stable lib/stripe.ts read helpers backed by the new uid-scoped layer.

import { getDb, COL } from "@/lib/firestore";
import type { User, UserPlan } from "@/lib/types";
import Link from "next/link";
import { ExternalLink, CreditCard } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobScout · Admin · Billing" };

const PLAN_PRICE_CENTS: Record<UserPlan, number> = { free: 0, pro: 1900, boost: 2900 };

async function loadBilling(): Promise<{
  users: User[];
  activeUsers: User[];
  estMrr: number;
  stripeConfigured: boolean;
}> {
  const db = getDb();
  if (!db) return { users: [], activeUsers: [], estMrr: 0, stripeConfigured: !!process.env.STRIPE_SECRET_KEY };
  const snap = await db.collection(COL.users).get();
  const users = snap.docs.map((d) => d.data() as User);
  const activeUsers = users.filter((u) =>
    (u.subscription_status === "active" || u.subscription_status === "trialing") && u.plan !== "free"
  );
  const estMrr = activeUsers.reduce((sum, u) => sum + PLAN_PRICE_CENTS[u.plan], 0);
  return { users, activeUsers, estMrr, stripeConfigured: !!process.env.STRIPE_SECRET_KEY };
}

export default async function AdminBillingPage() {
  const { users, activeUsers, estMrr, stripeConfigured } = await loadBilling();
  const mrr = (estMrr / 100).toFixed(2);
  const arr = (estMrr * 12 / 100).toFixed(2);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Billing</p>
      <h1 className="font-[family-name:var(--font-inter-tight)] mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
        Stripe-tracked revenue
      </h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Today: aggregates from the users collection. Full Stripe view (live subs, churn, failed pays) lands post-Phase-1B.
      </p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label="MRR (est.)" value={`$${mrr}`} sublabel={`${activeUsers.length} active subscriptions`} />
        <Tile label="ARR (est.)" value={`$${arr}`} sublabel="MRR × 12" />
        <Tile label="Total users" value={users.length.toLocaleString()} sublabel="Across all plans" />
      </div>

      <div className="mt-8 glass rounded-2xl p-5">
        <h3 className="font-semibold flex items-center gap-2">
          <CreditCard size={16} className="text-[var(--accent-2)]" />
          Stripe configuration
        </h3>
        <dl className="mt-3 space-y-2 text-sm">
          <Row k="STRIPE_SECRET_KEY"   v={stripeConfigured ? "✓ set" : "— missing"} good={stripeConfigured} />
          <Row k="STRIPE_WEBHOOK_SECRET" v={process.env.STRIPE_WEBHOOK_SECRET ? "✓ set" : "— missing"} good={!!process.env.STRIPE_WEBHOOK_SECRET} />
          <Row k="STRIPE_PRICE_PRO"   v={process.env.STRIPE_PRICE_PRO ? "✓ set" : "— missing"} good={!!process.env.STRIPE_PRICE_PRO} />
          <Row k="STRIPE_PRICE_BOOST" v={process.env.STRIPE_PRICE_BOOST ? "✓ set" : "— missing"} good={!!process.env.STRIPE_PRICE_BOOST} />
        </dl>
      </div>

      <div className="mt-6">
        <Link
          href="https://dashboard.stripe.com/subscriptions"
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--accent-2)] hover:underline"
        >
          Open Stripe Dashboard · Subscriptions <ExternalLink size={12} />
        </Link>
      </div>
    </div>
  );
}

function Tile({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-xs uppercase tracking-wider text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-inter-tight)] text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{sublabel}</p>
    </div>
  );
}

function Row({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)]/40 pb-2 last:border-0 last:pb-0">
      <dt className="text-[var(--muted)] font-mono text-xs">{k}</dt>
      <dd className={`font-medium ${good ? "text-[var(--good)]" : "text-[var(--muted)]"}`}>{v}</dd>
    </div>
  );
}
