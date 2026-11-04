// /status — public status page.
//
// Pings each critical dependency from the SERVER side at request time so we
// don't expose any client keys. Cached briefly to avoid hammering Anthropic
// + Stripe on every refresh. Shows green/yellow/red badges + last-check time.

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { getAnthropic } from "@/lib/anthropic";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { isFirestoreConfigured, getDb, COL } from "@/lib/firestore";

export const dynamic = "force-dynamic";
// Cache the live checks for 60s so a refresh flood doesn't run up costs.
export const revalidate = 60;

export const metadata = {
  title: "JobScout · Status",
  description: "Live status of JobScout — Cloud Run, Firestore, Stripe, Anthropic, and supporting services.",
};

type CheckStatus = "ok" | "degraded" | "down" | "skipped";
type Check = { name: string; status: CheckStatus; latency_ms: number | null; note: string };

async function checkFirestore(): Promise<Check> {
  const t0 = Date.now();
  if (!isFirestoreConfigured()) return { name: "Firestore", status: "skipped", latency_ms: null, note: "GOOGLE_CLOUD_PROJECT not set" };
  try {
    const db = getDb();
    if (!db) throw new Error("getDb returned null");
    await db.collection(COL.users).limit(1).get();
    return { name: "Firestore", status: "ok", latency_ms: Date.now() - t0, note: "users collection reachable" };
  } catch (e) {
    return { name: "Firestore", status: "down", latency_ms: Date.now() - t0, note: e instanceof Error ? e.message : "unknown error" };
  }
}

async function checkStripe(): Promise<Check> {
  const t0 = Date.now();
  if (!isStripeConfigured()) return { name: "Stripe", status: "skipped", latency_ms: null, note: "STRIPE_SECRET_KEY not set" };
  try {
    const stripe = getStripe();
    if (!stripe) throw new Error("getStripe returned null");
    // Lightweight call — list 1 price. Fails fast if creds are bad.
    await stripe.prices.list({ limit: 1 });
    return { name: "Stripe", status: "ok", latency_ms: Date.now() - t0, note: "API reachable, key valid" };
  } catch (e) {
    return { name: "Stripe", status: "down", latency_ms: Date.now() - t0, note: e instanceof Error ? e.message.slice(0, 120) : "unknown error" };
  }
}

async function checkAnthropic(): Promise<Check> {
  const t0 = Date.now();
  const anthropic = getAnthropic();
  if (!anthropic) return { name: "Anthropic", status: "skipped", latency_ms: null, note: "ANTHROPIC_API_KEY not set" };
  try {
    // Use a tiny 1-token completion to verify key + model auth without burning budget.
    await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "ok" }],
    });
    return { name: "Anthropic", status: "ok", latency_ms: Date.now() - t0, note: "API reachable, key valid" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Most common failure today: invalid x-api-key (we hit this when the key rotated).
    const isAuthErr = /invalid x-api-key|401|authentication/i.test(msg);
    return {
      name: "Anthropic",
      status: isAuthErr ? "down" : "degraded",
      latency_ms: Date.now() - t0,
      note: msg.slice(0, 150),
    };
  }
}

const SMTP_OK = !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
const CRON_OK = !!process.env.CRON_TOKEN;
const VAPID_OK = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;

export default async function StatusPage() {
  const checks: Check[] = await Promise.all([checkFirestore(), checkStripe(), checkAnthropic()]);
  // Config-only checks (no external call) — instant.
  checks.push({ name: "SMTP (transactional email)", status: SMTP_OK ? "ok" : "skipped", latency_ms: null, note: SMTP_OK ? "configured" : "SMTP_* env vars not set" });
  checks.push({ name: "Cron token", status: CRON_OK ? "ok" : "skipped", latency_ms: null, note: CRON_OK ? "configured" : "CRON_TOKEN not set" });
  checks.push({ name: "Push (VAPID keys)", status: VAPID_OK ? "ok" : "skipped", latency_ms: null, note: VAPID_OK ? "configured" : "VAPID keys not set" });

  const overall: CheckStatus = checks.some((c) => c.status === "down") ? "down"
    : checks.some((c) => c.status === "degraded") ? "degraded"
    : "ok";

  return (
    <div className="bg-aurora min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--border-soft)] bg-[var(--bg)]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Logo />
          <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">← Home</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
        <div className="flex items-center gap-3">
          <StatusBadge status={overall} large />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Status</p>
            <h1 className="font-[family-name:var(--font-inter-tight)] mt-0.5 text-3xl font-bold tracking-tight">
              {overall === "ok" ? "All systems operational" : overall === "degraded" ? "Some services degraded" : "Major outage in progress"}
            </h1>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Live server-side check · cached 60 s · last refresh {new Date().toLocaleString()}
            </p>
          </div>
        </div>

        <section className="mt-8 glass rounded-2xl divide-y divide-[var(--border)]">
          {checks.map((c) => (
            <div key={c.name} className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <StatusBadge status={c.status} />
                <div className="min-w-0">
                  <p className="font-semibold truncate">{c.name}</p>
                  <p className="text-xs text-[var(--muted)] truncate" title={c.note}>{c.note}</p>
                </div>
              </div>
              {c.latency_ms != null && (
                <span className="text-xs text-[var(--muted)] tabular-nums">{c.latency_ms} ms</span>
              )}
            </div>
          ))}
        </section>

        <p className="mt-6 text-xs text-[var(--muted)]">
          Production status — for incident history, see the public changelog. For real-time alerts, follow
          {" "}<a href="mailto:status@jobscout-hq.com" className="text-[var(--accent-2)] underline">status@jobscout-hq.com</a>.
        </p>
      </main>
    </div>
  );
}

function StatusBadge({ status, large }: { status: CheckStatus; large?: boolean }) {
  const sz = large ? 28 : 18;
  if (status === "ok")       return <CheckCircle2 size={sz} className="text-[var(--good)] shrink-0" />;
  if (status === "degraded") return <AlertTriangle size={sz} className="text-[var(--warn)] shrink-0" />;
  if (status === "down")     return <XCircle size={sz} className="text-[var(--bad)] shrink-0" />;
  return <Loader2 size={sz} className="text-[var(--muted)] shrink-0 opacity-50" />;
}
