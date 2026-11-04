// Sign-up page — gated behind JOBSCOUT_SIGNUPS_OPEN until the multi-tenant
// data layer refactor (Phase 1B) lands. Until then, new signups would
// overwrite Cory's single-tenant data (profile/me + flat collections).
// While closed, the page shows a waitlist CTA instead.

import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import { Logo } from "@/components/Logo";
import { GetStartedModal } from "@/components/GetStartedModal";
import { Sparkles, Lock } from "lucide-react";

export const metadata = { title: "Create your account" };
export const dynamic = "force-dynamic";

export default function SignUpPage() {
  // Accept any common truthy spelling so misconfigured env vars don't keep
  // the gate closed (e.g. "true", "1", "yes", "on" all open it).
  const raw = (process.env.JOBSCOUT_SIGNUPS_OPEN ?? "").trim().toLowerCase();
  const open = raw === "1" || raw === "true" || raw === "yes" || raw === "on";

  if (open) {
    return <AuthForm mode="signup" />;
  }

  return (
    <div className="bg-aurora min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-block">
            <Logo size="md" />
          </div>
          <span className="mt-3 inline-flex items-center gap-1 rounded-full border border-[var(--accent-2)]/40 bg-[var(--accent-2-soft)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--accent-2)]">
            <Lock size={10} /> Waitlist
          </span>
          <h1 className="font-[family-name:var(--font-inter-tight)] mt-4 text-3xl font-bold tracking-tight">
            We&apos;re opening sign-ups in waves.
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Drop your email — we&apos;ll send your invite the moment a seat opens.
            Founding users get the refer-2-for-20%-off Pro discount for life.
          </p>
        </div>

        <div className="glass rounded-2xl p-5 flex flex-col items-center gap-3 text-center">
          <Sparkles size={28} className="text-[var(--accent-2)]" />
          <p className="text-sm text-[var(--muted)]">
            Tap below — we send your invite + your refer-2-for-20% link in one email.
          </p>
          <GetStartedModal>Join the waitlist →</GetStartedModal>
        </div>

        <p className="mt-5 text-center text-sm text-[var(--muted)]">
          Already have an account?{" "}
          <Link href="/signin" className="text-[var(--accent-2)] hover:underline">Sign in →</Link>
        </p>
        <p className="mt-3 text-center text-[11px] text-[var(--muted)]">
          See <Link href="/terms" className="underline decoration-[var(--accent-2)]/40 hover:text-[var(--fg)]">Terms</Link>
          {" "}and <Link href="/privacy" className="underline decoration-[var(--accent-2)]/40 hover:text-[var(--fg)]">Privacy</Link>.
        </p>
      </div>
    </div>
  );
}
