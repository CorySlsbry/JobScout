// /admin/analytics — in-house analytics dashboard.
//
// Built on our own `events` collection (one doc per fire) so JobScout has
// real product analytics without needing a Google Analytics account. Each
// page_view + signup_completed + checkout_started + checkout_completed +
// feedback_submitted + chat-message event flows here.
//
// Queries are bounded list-reads (newest 1000 events) and aggregated in
// memory — cheap for the first ~50k events/day. When volume grows, the
// next step is per-day aggregate docs written by a cron.
//
// GA4 is kept as an OPTIONAL secondary channel for advanced exploration:
// supplying NEXT_PUBLIC_GA_MEASUREMENT_ID lights up GA4's funnel reports,
// path explorer, demographics, etc. But this page works fully without it.

import { getDb, COL } from "@/lib/firestore";
import { listRecentEvents } from "@/lib/events-log";
import type { AnalyticsEventLog } from "@/lib/events-log";
import { ExternalLink, BarChart3, Settings, Activity, Users, ShoppingCart, MousePointer, TrendingUp } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobScout · Admin · Analytics" };

const DAY = 24 * 60 * 60 * 1000;

type WindowKey = "h24" | "d7" | "d30";
type Windowed<T> = Record<WindowKey, T>;

function windowMs(key: WindowKey): number {
  return key === "h24" ? DAY : key === "d7" ? 7 * DAY : 30 * DAY;
}

function isWithin(eventCreatedAt: string, key: WindowKey, now: number): boolean {
  const t = Date.parse(eventCreatedAt);
  if (!Number.isFinite(t)) return false;
  return now - t <= windowMs(key);
}

function countByPredicate(events: AnalyticsEventLog[], pred: (e: AnalyticsEventLog) => boolean): Windowed<number> {
  const now = Date.now();
  return {
    h24: events.filter((e) => pred(e) && isWithin(e.created_at, "h24", now)).length,
    d7:  events.filter((e) => pred(e) && isWithin(e.created_at, "d7",  now)).length,
    d30: events.filter((e) => pred(e) && isWithin(e.created_at, "d30", now)).length,
  };
}

type LegacyCounter = { name: string; path: string | null; date: string; count: number; last_at: string };

async function loadLegacyLeaderboard(): Promise<Array<{ name: string; count: number }>> {
  const db = getDb();
  if (!db) return [];
  try {
    const snap = await db.collection(COL.usageCounters).orderBy("__name__", "desc").limit(500).get();
    const byName: Record<string, number> = {};
    for (const d of snap.docs) {
      if (!d.id.startsWith("evt__")) continue;
      const data = d.data() as LegacyCounter;
      byName[data.name] = (byName[data.name] ?? 0) + (data.count ?? 0);
    }
    return Object.entries(byName)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .map(([name, count]) => ({ name, count }));
  } catch {
    return [];
  }
}

export default async function AdminAnalyticsPage() {
  const [events, leaderboard] = await Promise.all([
    listRecentEvents(1000),
    loadLegacyLeaderboard(),
  ]);

  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? null;
  const now = Date.now();

  // ── Time-windowed counts ───────────────────────────────────────────
  const pageViews     = countByPredicate(events, (e) => e.name === "page_view");
  const signups       = countByPredicate(events, (e) => e.name === "signup_completed");
  const checkoutsCmpl = countByPredicate(events, (e) => e.name === "checkout_completed");

  // Sessions: distinct session_id within window
  function distinctSessions(key: WindowKey): number {
    const seen = new Set<string>();
    for (const e of events) {
      if (e.name !== "page_view" || !e.session_id) continue;
      if (!isWithin(e.created_at, key, now)) continue;
      seen.add(e.session_id);
    }
    return seen.size;
  }
  const sessions: Windowed<number> = { h24: distinctSessions("h24"), d7: distinctSessions("d7"), d30: distinctSessions("d30") };

  // ── 7-day funnel ──────────────────────────────────────────────────
  const within7 = (e: AnalyticsEventLog) => isWithin(e.created_at, "d7", now);
  const landingViews    = events.filter((e) => within7(e) && e.name === "page_view" && (e.path === "/" || e.path === "/pricing")).length;
  const signupPageViews = events.filter((e) => within7(e) && e.name === "page_view" && e.path === "/signup").length;
  const signupsDone     = events.filter((e) => within7(e) && e.name === "signup_completed").length;
  const checkoutsStart  = events.filter((e) => within7(e) && e.name === "checkout_started").length;
  const checkoutsDone   = events.filter((e) => within7(e) && e.name === "checkout_completed").length;

  // ── Top pages (last 7 days, page_view only) ───────────────────────
  const topPages = (() => {
    const map = new Map<string, number>();
    for (const e of events) {
      if (e.name !== "page_view" || !within7(e) || !e.path) continue;
      map.set(e.path, (map.get(e.path) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => b - a).slice(0, 12);
  })();

  // ── Top referrers (last 7 days, any event with referrer_domain) ───
  const topReferrers = (() => {
    const map = new Map<string, number>();
    for (const e of events) {
      if (!within7(e) || !e.referrer_domain) continue;
      map.set(e.referrer_domain, (map.get(e.referrer_domain) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => b - a).slice(0, 10);
  })();

  // Recent events stream (latest 50)
  const recent = events.slice(0, 50);

  return (
    <div>
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Analytics</p>
          <h1 className="font-[family-name:var(--font-inter-tight)] mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
            Live product analytics
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            In-house tracking — no GA account required. Powered by the <code className="bg-[var(--bg-elev-2)] rounded px-1 py-0.5 text-xs">events</code> collection.
          </p>
        </div>
        <div className="text-xs text-[var(--muted)]">
          Looking at most-recent {events.length.toLocaleString()} events
        </div>
      </div>

      {/* ── Headline tiles ───────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Page views" sub24={pageViews.h24} sub7={pageViews.d7} sub30={pageViews.d30} icon={<MousePointer />} />
        <Tile label="Unique sessions" sub24={sessions.h24} sub7={sessions.d7} sub30={sessions.d30} icon={<Users />} tone="accent" />
        <Tile label="Signups" sub24={signups.h24} sub7={signups.d7} sub30={signups.d30} icon={<TrendingUp />} tone="good" />
        <Tile label="Paid conversions" sub24={checkoutsCmpl.h24} sub7={checkoutsCmpl.d7} sub30={checkoutsCmpl.d30} icon={<ShoppingCart />} tone="violet" />
      </div>

      {/* ── 7-day funnel ────────────────────────────────────────── */}
      <div className="mt-8 glass rounded-2xl p-5">
        <h3 className="font-semibold flex items-center gap-2">
          <BarChart3 size={16} className="text-[var(--accent-2)]" />
          7-day acquisition funnel
        </h3>
        <p className="mt-1 text-xs text-[var(--muted)]">Stage-to-stage conversion. Visited landing → made it to the signup screen → completed signup → opened Stripe checkout → paid.</p>
        <div className="mt-5 space-y-2.5">
          <FunnelRow label="Landing page views"      n={landingViews}    prior={null} />
          <FunnelRow label="Signup page views"       n={signupPageViews} prior={landingViews} />
          <FunnelRow label="Signups completed"       n={signupsDone}     prior={signupPageViews} />
          <FunnelRow label="Checkouts started"       n={checkoutsStart}  prior={signupsDone} />
          <FunnelRow label="Checkouts completed (paid)" n={checkoutsDone} prior={checkoutsStart} highlight />
        </div>
      </div>

      {/* ── Top pages + Top referrers ───────────────────────────── */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Top pages — last 7 days" icon={<MousePointer size={16} />}>
          {topPages.length === 0
            ? <Empty msg="No page views yet. PageViewTracker fires the moment a visitor lands." />
            : <BarList items={topPages} max={topPages[0]?.[1] ?? 1} valueFmt={(v) => v.toLocaleString()} />}
        </Panel>
        <Panel title="Top referrers — last 7 days" icon={<ExternalLink size={16} />}>
          {topReferrers.length === 0
            ? <Empty msg="No external referrers captured yet. Most visitors so far came directly or via a session that already had a referrer logged." />
            : <BarList items={topReferrers} max={topReferrers[0]?.[1] ?? 1} valueFmt={(v) => v.toLocaleString()} />}
        </Panel>
      </div>

      {/* ── Event leaderboard + Recent stream ────────────────────── */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Top events — all-time" icon={<Activity size={16} />}>
          {leaderboard.length === 0
            ? <Empty msg="No events recorded yet. They land here automatically as the app gets used." />
            : (
              <ul className="space-y-1.5 text-sm">
                {leaderboard.map(({ name, count }) => (
                  <li key={name} className="flex items-center justify-between border-b border-[var(--border)]/40 pb-1.5 last:border-0">
                    <code className="font-mono text-xs">{name}</code>
                    <span className="tabular-nums font-semibold">{count.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
        </Panel>
        <Panel title="Recent events — newest 50" icon={<Activity size={16} />}>
          {recent.length === 0
            ? <Empty msg="No events yet." />
            : (
              <ul className="space-y-1 text-xs max-h-96 overflow-y-auto pr-1">
                {recent.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 border-b border-[var(--border)]/30 pb-1 last:border-0">
                    <span className="font-mono text-[10px] text-[var(--muted)] shrink-0 w-16 tabular-nums">{relTime(e.created_at)}</span>
                    <span className="flex-1 truncate"><code className="text-[var(--fg)]">{e.name}</code> {e.path && <span className="text-[var(--muted)]">· {e.path}</span>}</span>
                    {e.user_id && <span className="text-[10px] text-[var(--muted)] tabular-nums shrink-0" title={e.user_id}>{e.user_id.slice(0, 6)}…</span>}
                  </li>
                ))}
              </ul>
            )}
        </Panel>
      </div>

      {/* ── GA4 optional ─────────────────────────────────────────── */}
      <div className="mt-8 glass rounded-2xl p-5">
        <h3 className="font-semibold flex items-center gap-2">
          <Settings size={16} className="text-[var(--accent-2)]" />
          Google Analytics (optional)
        </h3>
        {measurementId ? (
          <p className="mt-2 text-sm text-[var(--good)]">
            ✓ GA4 wired ({measurementId.slice(0, 4)}…{measurementId.slice(-3)}). Page views and custom events flow into your GA property in addition to this dashboard.
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--muted)]">
            GA4 is optional — this dashboard works fully without it. If you want demographics, the GA Path Explorer, or anomaly detection, set <code className="bg-[var(--bg-elev-2)] rounded px-1.5 py-0.5 text-xs">NEXT_PUBLIC_GA_MEASUREMENT_ID</code> on Cloud Run. Get one at <a href="https://analytics.google.com" target="_blank" rel="noreferrer" className="underline">analytics.google.com</a>.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── building blocks ──────────────────────────────────────── */

function Tile({
  label, sub24, sub7, sub30, icon, tone,
}: {
  label: string; sub24: number; sub7: number; sub30: number;
  icon: React.ReactNode;
  tone?: "accent" | "good" | "violet";
}) {
  const c =
    tone === "accent" ? "text-[var(--accent)]" :
    tone === "good"   ? "text-[var(--good)]"   :
    tone === "violet" ? "text-[var(--accent-2)]" :
                        "text-[var(--fg)]";
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between text-[var(--muted)]">
        <span className="text-xs uppercase tracking-wider">{label}</span>
        <span className={`opacity-80 ${c}`}>{icon}</span>
      </div>
      <div className={`mt-2 font-[family-name:var(--font-inter-tight)] text-3xl font-bold ${c} tabular-nums`}>{sub7.toLocaleString()}</div>
      <p className="mt-1 text-[11px] text-[var(--muted)] tabular-nums">
        <span className="text-[var(--fg)]">{sub24.toLocaleString()}</span> last 24h ·
        <span className="text-[var(--fg)] ml-1">{sub7.toLocaleString()}</span> last 7d ·
        <span className="text-[var(--fg)] ml-1">{sub30.toLocaleString()}</span> last 30d
      </p>
    </div>
  );
}

function FunnelRow({
  label, n, prior, highlight,
}: { label: string; n: number; prior: number | null; highlight?: boolean }) {
  const pct = prior == null || prior === 0 ? null : (n / prior) * 100;
  // Visual bar relative to the funnel's top step (first call passes prior=null,
  // so we don't have it here — approximate via the row's own count as the max).
  // For a tighter visual, the layout above feeds the same `landingViews` value
  // as the implicit top of the funnel.
  const widthPct = prior == null ? 100 : prior === 0 ? 0 : Math.max(2, Math.min(100, (n / prior) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className={highlight ? "font-semibold text-[var(--accent-2)]" : "text-[var(--fg)]"}>{label}</span>
        <span className="tabular-nums">
          <strong>{n.toLocaleString()}</strong>
          {pct != null && <span className="ml-2 text-xs text-[var(--muted)]">{pct.toFixed(1)}% from prior</span>}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--bg-elev-2)] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${widthPct}%`,
            background: highlight ? "var(--grad-cosmic)" : "var(--accent-2)",
          }}
        />
      </div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="font-semibold flex items-center gap-2">
        <span className="text-[var(--accent-2)]">{icon}</span>
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-sm text-[var(--muted)] leading-relaxed">{msg}</p>;
}

function BarList({
  items, max, valueFmt,
}: { items: Array<[string, number]>; max: number; valueFmt: (v: number) => string }) {
  return (
    <ul className="space-y-2">
      {items.map(([label, value]) => {
        const w = max === 0 ? 0 : Math.max(2, Math.round((value / max) * 100));
        return (
          <li key={label}>
            <div className="flex items-center justify-between text-xs">
              <span className="truncate pr-2" title={label}>{label}</span>
              <span className="tabular-nums font-semibold">{valueFmt(value)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-[var(--bg-elev-2)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--accent-2)]" style={{ width: `${w}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function relTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
