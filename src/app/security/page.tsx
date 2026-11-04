// /security — public security disclosure page.
//
// Trust signal: tells security researchers + B2B procurement that we take
// vulnerability reports seriously, have a response SLA, and don't go after
// people for reporting in good faith.

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ShieldCheck, Mail, Clock, Award } from "lucide-react";

export const metadata = {
  title: "JobScout · Security",
  description: "Security policy, vulnerability disclosure, and responsible reporting program for JobScout.",
};

export default function SecurityPage() {
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
          <div className="rounded-2xl bg-[var(--bg-elev-2)] p-3 border border-[var(--border)]">
            <ShieldCheck size={24} className="text-[var(--accent-2)]" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Security</p>
            <h1 className="font-[family-name:var(--font-inter-tight)] mt-0.5 text-3xl font-bold tracking-tight">
              JobScout security policy
            </h1>
          </div>
        </div>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-[var(--fg)]">
          <section className="glass rounded-2xl p-5">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Mail size={18} className="text-[var(--accent-2)]" /> Report a vulnerability
            </h2>
            <p className="mt-2 text-[var(--muted)]">
              Email <a href="mailto:security@jobscout-hq.com" className="text-[var(--accent-2)] underline">security@jobscout-hq.com</a> (or <a href="mailto:cory.salisbury@gmail.com" className="text-[var(--accent-2)] underline">cory.salisbury@gmail.com</a>) with a clear writeup. Plain text is fine. We acknowledge within 48 hours and triage within 7 days.
            </p>
          </section>

          <section className="glass rounded-2xl p-5">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Clock size={18} className="text-[var(--accent-2)]" /> What we ask
            </h2>
            <ul className="mt-3 space-y-2 text-[var(--muted)] list-disc pl-5">
              <li>Give us 60 days to fix before public disclosure.</li>
              <li>Don&apos;t access other users&apos; data beyond what&apos;s needed to demonstrate the issue.</li>
              <li>Don&apos;t run automated scanners against production at scale. Manual probing + a small set of test accounts is fine.</li>
              <li>Don&apos;t pivot a finding into broader access — if you found a way in, stop and report.</li>
            </ul>
          </section>

          <section className="glass rounded-2xl p-5">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Award size={18} className="text-[var(--accent-2)]" /> What we promise
            </h2>
            <ul className="mt-3 space-y-2 text-[var(--muted)] list-disc pl-5">
              <li>Good-faith research = safe harbor. We won&apos;t pursue legal action against researchers acting within this policy.</li>
              <li>We acknowledge every credible report and credit researchers (with permission) in our changelog.</li>
              <li>For high-severity findings (RCE, auth bypass, mass-PII exposure) we offer a thank-you bounty. Email us for details.</li>
              <li>We share our remediation timeline and ship a fix or a documented mitigation within 30 days for high-severity issues.</li>
            </ul>
          </section>

          <section className="glass rounded-2xl p-5">
            <h2 className="font-semibold text-lg">Out of scope</h2>
            <ul className="mt-3 space-y-2 text-[var(--muted)] list-disc pl-5">
              <li>Vulnerabilities in third-party services we depend on (Firebase Auth, Stripe, Anthropic, Cloudflare, Google Cloud) — please report those to the vendor directly.</li>
              <li>Self-XSS or social-engineering attacks that require already-compromised user accounts.</li>
              <li>Reports based solely on missing security headers without a demonstrated attack path.</li>
              <li>Denial-of-service or volumetric attacks.</li>
              <li>Vulnerabilities in our marketing pages that don&apos;t expose authenticated data.</li>
            </ul>
          </section>

          <section className="glass rounded-2xl p-5">
            <h2 className="font-semibold text-lg">Security posture</h2>
            <ul className="mt-3 space-y-2 text-[var(--muted)] list-disc pl-5">
              <li>HTTPS everywhere with Google-managed certificates and HSTS.</li>
              <li>Session cookies are HttpOnly + Secure + SameSite=Lax. CSRF mitigated by SameSite + same-origin checks on mutating endpoints.</li>
              <li>Authentication via Firebase Auth with session-cookie verification on every request.</li>
              <li>Multi-tenant data isolation enforced at the data-access layer — every read/write requires the session UID.</li>
              <li>Stripe webhook signatures verified before any mutation.</li>
              <li>Secrets stored in Google Cloud Run env, never in source.</li>
              <li>Daily backups via Firestore point-in-time recovery.</li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
