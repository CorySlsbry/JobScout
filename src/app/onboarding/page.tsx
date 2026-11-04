import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Logo } from "@/components/Logo";
import OnboardingForm from "@/components/OnboardingForm";
import { getSessionUser } from "@/lib/auth";
import { getProfile } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get set up" };

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");

  const profile = await getProfile(user.uid);

  return (
    <div className="bg-aurora min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <Logo size="md" />
          <h1 className="font-[family-name:var(--font-inter-tight)] mt-4 text-3xl font-bold tracking-tight">
            Let&apos;s tune your scout
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            <Sparkles size={12} className="inline text-[var(--accent-2)]" /> 60 seconds. Free forever — no card.
          </p>
        </div>

        <OnboardingForm
          defaultName={profile.full_name || user.name || ""}
          defaultPhone={profile.phone || user.phone_number || ""}
          defaultSalary={profile.salary_floor || 150_000}
          defaultRemote={profile.remote_pref || "remote_first"}
        />

        <p className="mt-5 text-center text-xs text-[var(--muted)]">
          You can change anything later in Settings. <Link href="/feed" className="underline decoration-[var(--accent-2)]/40 hover:decoration-[var(--accent-2)]">Skip for now →</Link>
        </p>
      </div>
    </div>
  );
}
