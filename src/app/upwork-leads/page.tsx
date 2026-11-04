// Upwork — jobs surfaced from two sources:
//   1. Gmail inbox watcher (admin-only, requires Gmail OAuth on the profile)
//   2. Per-user RSS feeds set in /settings (Pro+ users)
//
// Open to ALL Pro+ users (was admin-only before — that was the inbox-only era).
// Free users see a tier-gate upsell.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, Mail, Rss, Crown } from "lucide-react";
import { listLeads } from "@/lib/leads";
import { getProfile } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { hasTier } from "@/lib/users";
import { Logo } from "@/components/Logo";
import UpworkLeadCard from "@/components/UpworkLeadCard";

export const dynamic = "force-dynamic";

export default async function UpworkLeadsPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/signin");

  // Pro+ tier gate. Admin always passes.
  if (!sessionUser.record || !hasTier(sessionUser.record, "pro")) {
    return (
      <div className="max-w-md mx-auto px-4 pt-12 pb-28 text-center">
        <div className="glass rounded-3xl p-6">
          <div className="inline-flex items-center justify-center rounded-2xl bg-[var(--accent-2-soft)] p-3 mb-3">
            <Crown size={24} className="text-[var(--accent-2)]" />
          </div>
          <h1 className="font-[family-name:var(--font-inter-tight)] text-2xl font-bold tracking-tight">Upwork is a Pro feature</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Add Upwork RSS feeds, get AI-drafted proposals, and apply in minutes. Pro is $19/mo.
          </p>
          <Link href="/settings" className="btn-cosmic mt-5 inline-block">Upgrade to Pro →</Link>
        </div>
      </div>
    );
  }

  const [leads, profile] = await Promise.all([
    listLeads(sessionUser.uid),
    getProfile(sessionUser.uid),
  ]);

  const gmailConnected = !!profile.gmail_refresh_token;
  const rssConfigured = (profile.upwork_search_urls ?? []).length > 0;
  const apply = leads.filter((l) => l.verdict === "apply" && l.status !== "dismissed");
  const undecided = leads.filter((l) => l.verdict === "undecided" && l.status !== "dismissed");
  const other = leads.filter((l) => (l.verdict !== "apply" && l.verdict !== "undecided") || l.status === "dismissed");
  const lastRun = profile.upwork_rss_last_run ?? profile.upwork_inbox_last_run;

  return (
    <div className="max-w-xl mx-auto px-4 pt-5 pb-28 space-y-5">
      <header className="flex items-center justify-between gap-2">
        <Logo size="md" />
        <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--fg)]">← Home</Link>
      </header>

      <div>
        <h1 className="font-[family-name:var(--font-inter-tight)] text-2xl font-bold tracking-tight flex items-center gap-2">
          <Inbox size={22} className="text-[var(--accent-2)]" /> Upwork
        </h1>
        <p className="text-sm text-[var(--muted)]">
          New Upwork jobs from your saved-search RSS feeds, scored + drafted automatically. Open any to apply on Upwork.
          {lastRun && <> Last checked {relTime(lastRun)}.</>}
        </p>
      </div>

      {!rssConfigured && !gmailConnected && (
        <section className="glass rounded-2xl p-5 border-[var(--accent-2)]/30">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)] flex items-center gap-1.5">
            <Rss size={12} /> Hook up your Upwork searches
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Add your Upwork RSS feed URL(s) in{" "}
            <Link href="/settings" className="text-[var(--accent-2)] underline hover:no-underline">Settings → Upwork sources</Link>.
            We&apos;ll poll hourly, score every new job against your resume, and pre-draft a proposal for the high matches.
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Don&apos;t have one? On Upwork: <strong className="text-[var(--fg)]">save a search</strong> → click the RSS icon →
            copy the URL. Or run a fresh search and append <code className="font-mono text-[10px] bg-[var(--bg-elev-2)] rounded px-1">&amp;sort=recency&amp;rss=1</code>.
          </p>
          {sessionUser.is_admin && !gmailConnected && (
            <p className="mt-3 text-[11px] text-[var(--muted)]">
              <Mail size={10} className="inline" /> Admin: you can also connect Gmail in Settings to watch your inbox for Upwork alert emails (legacy path).
            </p>
          )}
        </section>
      )}

      {(rssConfigured || gmailConnected) && leads.length === 0 && (
        <section className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center">
          <p className="text-sm text-[var(--muted)]">
            No leads yet. The hourly cron will populate this page on its next run, or trigger it manually with{" "}
            <code className="font-mono text-[10px] bg-[var(--bg-elev-2)] rounded px-1">/api/cron/upwork-rss</code>.
          </p>
        </section>
      )}

      {apply.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--good)]">
            Apply · {apply.length}
          </h2>
          {apply.map((l) => <UpworkLeadCard key={l.id} lead={l} />)}
        </section>
      )}

      {undecided.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">
            Score pending · {undecided.length}
          </h2>
          <p className="text-[11px] text-[var(--muted)] -mt-2">
            Pulled from RSS — will get scored + drafted on the next pass. Click <em>Open on Upwork</em> to review now.
          </p>
          {undecided.map((l) => <UpworkLeadCard key={l.id} lead={l} />)}
        </section>
      )}

      {other.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
            Skipped / dismissed · {other.length}
          </h2>
          {other.map((l) => <UpworkLeadCard key={l.id} lead={l} />)}
        </section>
      )}
    </div>
  );
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
