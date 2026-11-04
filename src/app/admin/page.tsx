// Admin dashboard home — aggregate stats across all users.
//
// All queries here are CROSS-USER aggregations (counts + sums) so they don't
// go through the uid-scoped data-access layer being refactored in Phase 1B.
// They hit Firestore directly via getDb() with `.count().get()` aggregations
// where supported, otherwise via `.get()` + length (works fine while the user
// table is small — first 1000 users).

import { getDb, COL } from "@/lib/firestore";
import type { User, UserPlan } from "@/lib/types";
import Link from "next/link";
import { Users, CreditCard, Activity, TrendingUp, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

type DashboardStats = {
  totalUsers: number;
  byPlan: Record<UserPlan, number>;
  activeSubs: number;
  estimatedMrr: number;       // cents
  signupsLast24h: number;
  signupsLast7d: number;
  signupsLast30d: number;
  lastCronAt: string | null;
  jobsInPool: number;
  configured: boolean;
};

const PLAN_PRICE_CENTS: Record<UserPlan, number> = { free: 0, pro: 1900, boost: 2900 };

async function getStats(): Promise<DashboardStats> {
  const db = getDb();
  if (!db) {
    return {
      totalUsers: 0, byPlan: { free: 0, pro: 0, boost: 0 },
      activeSubs: 0, estimatedMrr: 0,
      signupsLast24h: 0, signupsLast7d: 0, signupsLast30d: 0,
      lastCronAt: null, jobsInPool: 0, configured: false,
    };
  }

  const usersSnap = await db.collection(COL.users).get();
  const users = usersSnap.docs.map((d) => d.data() as User);
  const now = Date.now();
  const ms24h = 24 * 60 * 60 * 1000;
  const ms7d = 7 * ms24h;
  const ms30d = 30 * ms24h;

  const byPlan: Record<UserPlan, number> = { free: 0, pro: 0, boost: 0 };
  let activeSubs = 0;
  let mrr = 0;
  let s24 = 0, s7 = 0, s30 = 0;

  for (const u of users) {
    byPlan[u.plan] = (byPlan[u.plan] ?? 0) + 1;
    const isActive = u.subscription_status === "active" || u.subscription_status === "trialing";
    if (isActive && u.plan !== "free") {
      activeSubs++;
      mrr += PLAN_PRICE_CENTS[u.plan];
    }
    const created = u.created_at ? new Date(u.created_at).getTime() : NaN;
    if (Number.isFinite(created)) {
      const age = now - created;
      if (age <= ms24h) s24++;
      if (age <= ms7d)  s7++;
      if (age <= ms30d) s30++;
    }
  }

  // jobs in pool — count is fast for small pools, fine for now
  let jobsInPool = 0;
  try {
    const jobsAgg = await db.collection(COL.jobs).count().get();
    jobsInPool = jobsAgg.data().count;
  } catch {
    // older Firestore admin SDKs lack .count() — fall back to a bounded list
    const snap = await db.collection(COL.jobs).limit(2000).get();
    jobsInPool = snap.size;
  }

  // last cron run — best-effort, search_runs collection isn't guaranteed
  let lastCronAt: string | null = null;
  try {
    const runsSnap = await db.collection(COL.searchRuns).orderBy("created_at", "desc").limit(1).get();
    if (!runsSnap.empty) {
      const raw = runsSnap.docs[0].data() as { created_at?: string };
      lastCronAt = raw.created_at ?? null;
    }
  } catch {
    // collection may not exist yet
  }

  return {
    totalUsers: users.length, byPlan,
    activeSubs, estimatedMrr: mrr,
    signupsLast24h: s24, signupsLast7d: s7, signupsLast30d: s30,
    lastCronAt, jobsInPool, configured: true,
  };
}

export default async function AdminDashboardPage() {
  const s = await getStats();
  const mrrUsd = (s.estimatedMrr / 100).toFixed(2);

  if (!s.configured) {
    return (
      <div className="glass rounded-3xl p-8 text-center">
        <AlertCircle size={32} className="mx-auto text-[var(--warn)]" />
        <h1 className="mt-4 text-xl font-semibold">Firestore not configured</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Set GOOGLE_CLOUD_PROJECT on Cloud Run to enable admin queries.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Dashboard</p>
          <h1 className="font-[family-name:var(--font-inter-tight)] mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
            JobScout at a glance
          </h1>
        </div>
        <p className="text-xs text-[var(--muted)]">Live · Firestore aggregates</p>
      </div>

      {/* ── Headline tiles ─────────────────────────────── */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Total users"        value={s.totalUsers.toLocaleString()} sublabel={`${s.byPlan.free} free · ${s.byPlan.pro} pro · ${s.byPlan.boost} boost`} icon={<Users />} />
        <StatTile label="Active subscriptions" value={s.activeSubs.toLocaleString()} sublabel={`${(s.byPlan.pro + s.byPlan.boost).toLocaleString()} paid plans on file`} icon={<CreditCard />} tone="accent" />
        <StatTile label="Est. MRR"            value={`$${mrrUsd}`} sublabel="Sum of active Pro + Boost" icon={<TrendingUp />} tone="good" />
        <StatTile label="Signups · 24h / 7d / 30d" value={`${s.signupsLast24h} / ${s.signupsLast7d} / ${s.signupsLast30d}`} sublabel="Rolling windows" icon={<TrendingUp />} />
      </div>

      {/* ── System health ─────────────────────────────── */}
      <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 text-xs text-[var(--muted)] uppercase tracking-wider">
            <Activity size={14} className="text-[var(--accent-2)]" /> System
          </div>
          <h3 className="mt-2 font-semibold">Job pool + cron</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <Row k="Jobs in shared pool" v={s.jobsInPool.toLocaleString()} />
            <Row k="Last cron run" v={s.lastCronAt ? new Date(s.lastCronAt).toLocaleString() : "—"} />
          </dl>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 text-xs text-[var(--muted)] uppercase tracking-wider">
            <CreditCard size={14} className="text-[var(--accent-2)]" /> Billing
          </div>
          <h3 className="mt-2 font-semibold">Plan breakdown</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <Row k="Free" v={`${s.byPlan.free} (${pct(s.byPlan.free, s.totalUsers)})`} />
            <Row k="Pro ($19)" v={`${s.byPlan.pro} (${pct(s.byPlan.pro, s.totalUsers)})`} />
            <Row k="Boost ($29)" v={`${s.byPlan.boost} (${pct(s.byPlan.boost, s.totalUsers)})`} />
          </dl>
        </div>
      </div>

      {/* ── Quick links ────────────────────────────────── */}
      <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <QuickLink href="/admin/users"   title="Users"   desc="Search, filter, manually grant Pro/Boost" />
        <QuickLink href="/admin/billing" title="Billing" desc="Stripe subscriptions, MRR breakdown, churn" />
        <QuickLink href="/admin/system"  title="System"  desc="Cron logs, error events, recent syncs" />
      </div>
    </div>
  );
}

function pct(n: number, total: number): string {
  if (!total) return "0%";
  return Math.round((n / total) * 100) + "%";
}

function StatTile({
  label, value, sublabel, icon, tone,
}: {
  label: string; value: string; sublabel: string; icon: React.ReactNode;
  tone?: "accent" | "good";
}) {
  const c =
    tone === "accent" ? "text-[var(--accent)]" :
    tone === "good"   ? "text-[var(--good)]"   :
                        "text-[var(--fg)]";
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between text-[var(--muted)]">
        <span className="text-xs uppercase tracking-wider">{label}</span>
        <span className={`opacity-80 ${c}`}>{icon}</span>
      </div>
      <div className={`mt-2 font-[family-name:var(--font-inter-tight)] text-3xl font-bold ${c}`}>{value}</div>
      <p className="mt-1 text-xs text-[var(--muted)]">{sublabel}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)]/40 pb-2 last:border-0 last:pb-0">
      <dt className="text-[var(--muted)]">{k}</dt>
      <dd className="font-medium tabular-nums">{v}</dd>
    </div>
  );
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="glass rounded-2xl p-5 hover:border-[var(--accent-2)]/40 transition-colors block">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{desc}</p>
    </Link>
  );
}
