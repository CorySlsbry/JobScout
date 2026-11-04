// /autopilot — the "ready to apply" queue. Auto-Pilot prepared a tailored
// resume + cover letter for each of these high-match jobs; the user reviews
// and applies in one tap.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Rocket, Crown, Settings } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getProfile } from "@/lib/db";
import { hasTier } from "@/lib/users";
import { listPreparedApplications } from "@/lib/autopilot";
import { Logo } from "@/components/Logo";
import PreparedApplicationCard from "@/components/PreparedApplicationCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobScout · Auto-Pilot" };

export default async function AutopilotPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/signin?from=/autopilot");

  if (!sessionUser.record || !hasTier(sessionUser.record, "pro")) {
    return (
      <div className="max-w-md mx-auto px-4 pt-12 pb-28 text-center">
        <div className="glass rounded-3xl p-6">
          <div className="inline-flex items-center justify-center rounded-2xl bg-[var(--accent-2-soft)] p-3 mb-3">
            <Crown size={24} className="text-[var(--accent-2)]" />
          </div>
          <h1 className="font-[family-name:var(--font-inter-tight)] text-2xl font-bold tracking-tight">Auto-Pilot is a Pro feature</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Let JobScout auto-prepare a tailored resume + cover letter for every high-match job, so applying is one tap. Pro is $19/mo.
          </p>
          <Link href="/settings" className="btn-cosmic mt-5 inline-block">Upgrade to Pro →</Link>
        </div>
      </div>
    );
  }

  const [profile, prepared] = await Promise.all([
    getProfile(sessionUser.uid),
    listPreparedApplications(sessionUser.uid),
  ]);
  const enabled = !!profile.autopilot_enabled;

  return (
    <div className="max-w-xl mx-auto px-4 pt-5 pb-28 space-y-5">
      <header className="flex items-center justify-between gap-2">
        <Logo size="md" />
        <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--fg)]">← Home</Link>
      </header>

      <div>
        <h1 className="font-[family-name:var(--font-inter-tight)] text-2xl font-bold tracking-tight flex items-center gap-2">
          <Rocket size={22} className="text-[var(--accent-2)]" /> Auto-Pilot
        </h1>
        <p className="text-sm text-[var(--muted)]">
          High-match jobs with a tailored resume + cover letter already written. Review, then apply in one tap.
        </p>
      </div>

      {!enabled && (
        <section className="glass rounded-2xl p-4 border-[var(--accent-2)]/30">
          <p className="text-sm text-[var(--muted)]">
            Auto-Pilot is currently <strong className="text-[var(--fg)]">off</strong>. Turn it on in{" "}
            <Link href="/settings" className="text-[var(--accent-2)] underline hover:no-underline inline-flex items-center gap-1">
              <Settings size={12} /> Settings
            </Link>{" "}
            and set your score threshold. The next run will start preparing applications for your top matches.
          </p>
        </section>
      )}

      {enabled && prepared.length === 0 && (
        <section className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center">
          <p className="text-sm text-[var(--muted)]">
            Auto-Pilot is on, but nothing&apos;s prepared yet. The next run will tailor applications for jobs scoring ≥{" "}
            <strong className="text-[var(--fg)]">{profile.autopilot_min_score ?? 85}</strong>. Make sure you&apos;ve saved a base resume in{" "}
            <Link href="/settings" className="text-[var(--accent-2)] underline hover:no-underline">Settings</Link>.
          </p>
        </section>
      )}

      {prepared.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--good)]">
            Ready to apply · {prepared.length}
          </h2>
          {prepared.map((app) => <PreparedApplicationCard key={app.id} app={app} />)}
        </section>
      )}
    </div>
  );
}
