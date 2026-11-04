import Link from "next/link";
import { Suspense } from "react";
import { Check, X, Crown, Sparkles, Bot } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { GetStartedModal } from "@/components/GetStartedModal";
import ReferralCapture from "@/components/ReferralCapture";

export const metadata = { title: "Pricing" };

const COMPARE_ROWS: Array<{ feature: string; free: boolean | string; pro: boolean | string; boost: boolean | string }> = [
  { feature: "Jobs scored / day",              free: "5",   pro: "Unlimited",     boost: "Unlimited" },
  { feature: "AI-tailored resumes / month",    free: "3",   pro: "Unlimited",     boost: "Unlimited" },
  { feature: "Cover letters / month",          free: "2",   pro: "Unlimited",     boost: "Unlimited" },
  { feature: "Job boards",                     free: "All",  pro: "All",           boost: "All" },
  { feature: "Upwork bidder (Chrome extension)", free: false, pro: true,            boost: true },
  { feature: "Gmail inbox watcher (auto pre-drafts)", free: false, pro: true,    boost: true },
  { feature: "Interview Story Bank",           free: false, pro: true,            boost: true },
  { feature: "Assessment uploads",             free: false, pro: true,            boost: true },
  { feature: "Aim & calibration prompts",      free: true,  pro: true,            boost: true },
  { feature: "Comp Intelligence (per-company benchmarks)", free: false, pro: false, boost: true },
  { feature: "Negotiation Playbook (one-tap offer prep)",  free: false, pro: false, boost: true },
  { feature: "Push to phone (PWA)",            free: true,  pro: true,            boost: true },
  { feature: "★ Refer 2 → 20% off forever",    free: false, pro: true,            boost: true },
  { feature: "Email support",                  free: true,  pro: true,            boost: "Priority" },
];

export default function PricingPage() {
  return (
    <div className="bg-aurora min-h-screen">
      <Suspense fallback={null}><ReferralCapture /></Suspense>
      <MarketingNav />

      <section className="mx-auto max-w-4xl px-4 sm:px-6 pt-12 sm:pt-16 pb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Pricing</p>
        <h1 className="font-[family-name:var(--font-inter-tight)] mt-2 text-4xl sm:text-5xl font-bold tracking-tight">
          Free to score. <span className="grad-text">Pay when it&apos;s applying for you.</span>
        </h1>
        <p className="mt-4 text-[var(--muted)] max-w-2xl mx-auto">
          Free tier sees every job, scores 5 per day. Pro unlocks the Upwork bidder and Gmail watcher that
          apply on autopilot. Boost adds compensation intelligence and a one-tap negotiation playbook.
          Cancel anytime, no questions asked.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-12 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Tier
          name="Free" price="$0" cadence="forever"
          icon={<Bot size={18} className="text-[var(--muted)]" />}
          desc="Score before you commit. Daily limits keep costs sane."
          cta={<Link href="/signup" className="block w-full text-center rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)] px-4 py-2.5 text-sm font-semibold hover:border-[var(--accent-2)]">Start free →</Link>}
          bullets={[
            "5 jobs scored per day",
            "3 AI-tailored resumes / month",
            "2 AI cover letters / month",
            "All job boards (LinkedIn / Indeed / ZipRecruiter / Glassdoor / Greenhouse / Ashby / Lever)",
            "Push to phone (PWA)",
          ]}
        />
        <Tier
          name="Pro" price="$19" cadence="/ month" highlight
          icon={<Sparkles size={18} className="text-[var(--accent-2)]" />}
          desc="The full engine — Upwork bidder, Gmail watcher, unlimited drafting."
          cta={<Link href="/signup?intent=pro" className="btn-cosmic block text-center text-sm w-full">Start Pro →</Link>}
          bullets={[
            "Everything in Free, unlimited",
            "Upwork bidder Chrome extension — score, draft, fill",
            "Gmail inbox watcher — auto pre-drafts new alerts hourly",
            "Interview Story Bank (STAR+R)",
            "Assessment uploads (Zapier AI Fluency, HackerRank, etc.)",
            "Refer 2 friends → 20% off forever",
          ]}
        />
        <Tier
          name="Boost" price="$29" cadence="/ month"
          icon={<Crown size={18} className="text-[var(--accent-2)]" />}
          desc="Pro + compensation intelligence + negotiation playbook."
          cta={<Link href="/signup?intent=boost" className="block text-center rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)] px-4 py-2.5 text-sm font-semibold hover:border-[var(--accent-2)] w-full">Start Boost →</Link>}
          bullets={[
            "Everything in Pro",
            "Comp Intelligence — per-company benchmarks, 7-day cache",
            "Negotiation Playbook — one-tap offer prep",
            "Priority email support",
          ]}
        />
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-20">
        <div className="glass rounded-3xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                <th className="text-left p-4 font-medium">Compare</th>
                <th className="p-4 font-medium">Free</th>
                <th className="p-4 font-medium grad-text">Pro</th>
                <th className="p-4 font-medium">Boost</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row, i) => (
                <tr key={row.feature} className={i % 2 ? "bg-[var(--bg-elev-2)]/30" : ""}>
                  <td className="p-3 sm:p-4">{row.feature}</td>
                  <Cell v={row.free} />
                  <Cell v={row.pro} highlight />
                  <Cell v={row.boost} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 sm:px-6 pb-20 text-center">
        <h2 className="font-[family-name:var(--font-inter-tight)] text-2xl sm:text-3xl font-bold">Still scrolling LinkedIn at 11pm?</h2>
        <p className="mt-3 text-[var(--muted)]">JobScout&apos;s been awake. Push the work to your phone.</p>
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <GetStartedModal>Start free →</GetStartedModal>
          <Link href="/feed" className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] px-5 py-3 text-sm font-medium hover:border-[var(--accent-2)]">
            Open the demo
          </Link>
        </div>
      </section>
    </div>
  );
}

function Cell({ v, highlight }: { v: boolean | string; highlight?: boolean }) {
  const base = "p-3 sm:p-4 text-center";
  if (typeof v === "string") return <td className={`${base} ${highlight ? "font-semibold text-[var(--fg)]" : "text-[var(--muted)]"}`}>{v}</td>;
  return (
    <td className={base}>
      {v ? <Check size={16} className={`mx-auto ${highlight ? "text-[var(--accent-2)]" : "text-[var(--good)]"}`} /> :
           <X size={16} className="mx-auto text-[var(--border)]" />}
    </td>
  );
}

function Tier({
  name, price, cadence, desc, bullets, cta, highlight, icon,
}: {
  name: string; price: string; cadence: string; desc: string;
  bullets: string[]; cta: React.ReactNode; highlight?: boolean; icon?: React.ReactNode;
}) {
  return (
    <div className={`relative rounded-2xl p-6 ${
      highlight
        ? "border-2 border-transparent"
        : "border border-[var(--border)] bg-[var(--bg-elev)]"
    }`}
    style={highlight ? {
      background: "linear-gradient(var(--bg-elev), var(--bg-elev)) padding-box, var(--grad-cosmic) border-box",
      boxShadow: "var(--shadow-glow), var(--shadow-card)",
    } : undefined}
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ background: "var(--grad-cosmic)" }}>★ Most popular</span>
      )}
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-medium text-[var(--muted)]">{name}</p>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-[family-name:var(--font-inter-tight)] text-4xl font-bold">{price}</span>
        <span className="text-sm text-[var(--muted)]">{cadence}</span>
      </div>
      <p className="mt-2 text-sm text-[var(--muted)] min-h-[3rem]">{desc}</p>
      <ul className="mt-4 space-y-2">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm">
            <Check size={16} className="mt-0.5 shrink-0 text-[var(--accent-2)]" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">{cta}</div>
    </div>
  );
}
