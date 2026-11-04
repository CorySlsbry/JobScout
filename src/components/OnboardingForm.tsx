"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { User, Phone, MapPin, DollarSign, Loader2, AlertCircle, Sparkles } from "lucide-react";

type RemotePref = "remote_only" | "remote_first" | "hybrid_ok" | "onsite_ok";

export default function OnboardingForm({
  defaultName, defaultPhone, defaultSalary, defaultRemote,
}: {
  defaultName: string; defaultPhone: string; defaultSalary: number; defaultRemote: RemotePref;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // intent forwards from /signup?intent=pro|boost — when set, completing
  // onboarding launches a Stripe checkout session for that plan.
  const intent = (() => {
    const i = searchParams?.get("intent");
    return i === "pro" || i === "boost" ? i : null;
  })();

  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [salary, setSalary] = useState(defaultSalary);
  const [remote, setRemote] = useState<RemotePref>(defaultRemote);
  const [city, setCity] = useState("St George, UT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/profile/onboarding", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: name.trim(),
          phone: phone.trim(),
          salary_floor: Math.max(0, Math.round(salary)),
          remote_pref: remote,
          target_locations: city.trim()
            ? [city.trim(), "Remote"]
            : ["Remote"],
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "save_failed");
      }

      // Intent-aware completion: if we got here from a Pro/Boost CTA, chain
      // directly into Stripe checkout. Otherwise go to /feed as before.
      if (intent) {
        try {
          const checkoutRes = await fetch("/api/stripe/checkout", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan: intent }),
          });
          const j = await checkoutRes.json();
          if (checkoutRes.ok && j.url) {
            window.location.href = j.url;
            return;
          }
          // Stripe not configured or other failure — fall through to /feed
          // with a banner explaining the user can upgrade from /settings.
          router.push(`/feed?upgrade=${intent}&pending=stripe`);
          return;
        } catch {
          router.push(`/feed?upgrade=${intent}&pending=stripe`);
          return;
        }
      }

      router.push("/feed");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "save_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass rounded-2xl p-5 space-y-4">
      {intent && (
        <div className="rounded-xl border border-[var(--accent-2)]/40 bg-[var(--accent-2-soft)] p-3 text-xs text-[var(--accent-2)] flex items-start gap-2">
          <Sparkles size={14} className="mt-0.5 shrink-0" />
          <span>
            <strong>{intent === "boost" ? "Boost" : "Pro"} signup —</strong> finish these fields and we&apos;ll
            open Stripe checkout. Cancel any time, 30-day callback guarantee.
          </span>
        </div>
      )}
      <Field label="Your name" icon={<User size={16} />}>
        <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2}
          autoComplete="name" className="flex-1 bg-transparent outline-none" />
      </Field>
      <Field label="Phone number" icon={<Phone size={16} />}>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" required
          autoComplete="tel" placeholder="(555) 123-4567" className="flex-1 bg-transparent outline-none" />
      </Field>
      <Field label="Dream city (optional)" icon={<MapPin size={16} />}>
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="St George, UT"
          autoComplete="address-level2" className="flex-1 bg-transparent outline-none" />
      </Field>
      <Field label="Salary floor (USD/yr)" icon={<DollarSign size={16} />}>
        <input value={salary} onChange={(e) => setSalary(Number(e.target.value) || 0)} type="number"
          min={0} step={5000} className="flex-1 bg-transparent outline-none" />
      </Field>
      <label className="block">
        <span className="block text-xs font-medium text-[var(--muted)] mb-1">Remote preference</span>
        <select value={remote} onChange={(e) => setRemote(e.target.value as RemotePref)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2.5 focus:border-[var(--accent-2)] outline-none">
          <option value="remote_only">Remote only</option>
          <option value="remote_first">Remote first (preferred — your dream city counts as remote-equivalent)</option>
          <option value="hybrid_ok">Hybrid OK</option>
          <option value="onsite_ok">Onsite OK</option>
        </select>
      </label>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--bad)]/40 bg-[var(--bad-soft)] p-2.5 text-xs text-[var(--bad)]">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button type="submit" disabled={busy} className="btn-cosmic w-full inline-flex items-center justify-center gap-2 disabled:opacity-50">
        {busy
          ? <><Loader2 size={16} className="animate-spin" /> {intent ? "Saving & opening checkout…" : "Saving…"}</>
          : (intent ? `Continue to ${intent === "boost" ? "Boost" : "Pro"} checkout →` : "Open my feed →")}
      </button>
    </form>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--muted)] mb-1">{label}</span>
      <span className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2.5 focus-within:border-[var(--accent-2)] transition-colors">
        <span className="text-[var(--muted)] shrink-0">{icon}</span>
        {children}
      </span>
    </label>
  );
}
