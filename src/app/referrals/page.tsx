// /referrals — user-facing refer-link + running count.
//
// Mirrors the marketing promise on the landing page: "Refer 2 friends who stay
// subscribed → 20% off Pro forever." User sees their personal link, can copy
// it, and tracks how many credited referrals they have.

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Share2, Gift, Users } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getUser } from "@/lib/users";
import ReferralCopyButton from "@/components/ReferralCopyButton";

// In server-rendered pages we don't have access to the Request, so we fall back
// to the canonical domain. OAUTH_BASE_URL overrides for local-dev shenanigans.
const SITE_URL = process.env.OAUTH_BASE_URL?.replace(/\/$/, "") || "https://jobscout-hq.com";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobScout · Referrals" };

export default async function ReferralsPage() {
  const session = await getSessionUser();
  if (!session) redirect("/signin?from=/referrals");

  const user = (await getUser(session.uid)) ?? session.record ?? null;
  if (!user) redirect("/onboarding");

  const link = `${SITE_URL}/?ref=${encodeURIComponent(user.refer_code)}`;
  const count = user.referral_count ?? 0;
  const needed = Math.max(0, 2 - count);
  const unlocked = count >= 2;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 pb-28">
      <header className="pt-5 flex items-center gap-3">
        <Link href="/settings" className="rounded-full p-1.5 hover:bg-[var(--bg-elev)] text-[var(--muted)] hover:text-[var(--fg)]" aria-label="Back">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Referrals</p>
          <h1 className="font-[family-name:var(--font-inter-tight)] mt-0.5 text-2xl sm:text-3xl font-bold tracking-tight">
            Refer 2 friends, get <span className="grad-text">20% off Pro forever</span>
          </h1>
        </div>
      </header>

      {/* Progress card */}
      <section className="mt-6 glass rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Credited referrals</p>
            <p className="mt-1 font-[family-name:var(--font-inter-tight)] text-4xl font-bold tabular-nums">
              {count}<span className="text-[var(--muted)] text-2xl"> / 2</span>
            </p>
            <p className="mt-1 text-sm">
              {unlocked
                ? <span className="text-[var(--good)] font-semibold">🎉 Unlocked! 20% off Pro is applied to your next renewal.</span>
                : <span className="text-[var(--muted)]">{needed} more {needed === 1 ? "friend" : "friends"} need to sign up and stay subscribed past month 1.</span>}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--accent-2-soft)] p-2.5 shrink-0">
            <Gift size={22} className="text-[var(--accent-2)]" />
          </div>
        </div>
      </section>

      {/* Refer link */}
      <section className="mt-4 glass rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)] flex items-center gap-1.5">
          <Share2 size={12} /> Your refer link
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Share this with anyone job-searching. We credit the referral once they sign up + stay subscribed through their first month.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-xs font-mono truncate">{link}</code>
          <ReferralCopyButton link={link} />
        </div>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Your refer code: <code className="bg-[var(--bg-elev-2)] rounded px-1 py-0.5 font-mono text-[var(--fg)]">{user.refer_code}</code>
        </p>
      </section>

      {/* How it works */}
      <section className="mt-4 glass rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)] flex items-center gap-1.5">
          <Users size={12} /> How it works
        </p>
        <ol className="mt-3 space-y-2 text-sm">
          <li className="flex items-start gap-2"><span className="font-bold text-[var(--accent-2)] tabular-nums">01.</span> Share the link above with anyone tired of LinkedIn job-hunt grind.</li>
          <li className="flex items-start gap-2"><span className="font-bold text-[var(--accent-2)] tabular-nums">02.</span> They sign up via your link — we cookie the ref code for 90 days so they get attributed even if they sign up later.</li>
          <li className="flex items-start gap-2"><span className="font-bold text-[var(--accent-2)] tabular-nums">03.</span> Once 2 of your referrals stay subscribed past their first month, we apply a permanent 20% off Pro discount to your account.</li>
          <li className="flex items-start gap-2"><span className="font-bold text-[var(--accent-2)] tabular-nums">04.</span> They keep paying full price. You keep the discount as long as you stay subscribed.</li>
        </ol>
      </section>

      <p className="mt-6 text-xs text-[var(--muted)]">
        Pro tip: The link works as a marketing tag too — drop it in your LinkedIn About section, your bio link, or pinned tweets.
      </p>
    </div>
  );
}
