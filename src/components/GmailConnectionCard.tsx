// Settings card — connect the Gmail inbox the Upwork watcher polls.
// Admin-only. Server component: the Connect action is a plain link to the
// OAuth start route.

import Link from "next/link";
import { Mail, CheckCircle2, ArrowRight } from "lucide-react";

export default function GmailConnectionCard({
  connected,
  connectedEmail,
  connectedAt,
  lastRun,
  oauthConfigured,
}: {
  connected: boolean;
  connectedEmail: string | null;
  connectedAt: string | null;
  lastRun: string | null;
  oauthConfigured: boolean;
}) {
  return (
    <section className="glass rounded-2xl p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)] flex items-center gap-1.5">
        <Mail size={12} /> Upwork inbox watcher
      </h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Connect the Gmail that receives your Upwork job-alert emails. JobScout checks it hourly,
        scores every job against your resume, and pre-drafts proposals for the matches —
        staged on the <Link href="/upwork-leads" className="text-[var(--accent-2)] hover:underline">Upwork leads</Link> page.
      </p>

      {!oauthConfigured && (
        <div className="mt-3 rounded-lg border border-[var(--warn)]/30 bg-[var(--warn-soft)] p-2.5 text-xs text-[var(--warn)] space-y-1">
          <p>⚠️ Gmail OAuth not configured on the server.</p>
          <p className="text-[var(--muted)]">
            Create a Web-application OAuth client in Google Cloud Console (project jobscout-app),
            enable the Gmail API, and set <code className="font-mono">GMAIL_OAUTH_CLIENT_ID</code> +{" "}
            <code className="font-mono">GMAIL_OAUTH_CLIENT_SECRET</code> on Cloud Run.
          </p>
        </div>
      )}

      {connected ? (
        <div className="mt-3 rounded-xl border border-[var(--good)]/30 bg-[var(--good-soft)] p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--good)]">
            <CheckCircle2 size={15} /> Connected{connectedEmail ? `: ${connectedEmail}` : ""}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {connectedAt && <>Linked {fmtDate(connectedAt)}. </>}
            {lastRun ? <>Last inbox check {fmtDate(lastRun)}.</> : <>First check runs on the next hourly cron.</>}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/upwork-leads" className="btn-cosmic inline-flex items-center gap-1.5 text-xs">
              View leads <ArrowRight size={12} />
            </Link>
            {oauthConfigured && (
              <a
                href="/api/oauth/gmail/start"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-1.5 text-xs font-medium hover:border-[var(--accent-2)]"
              >
                Re-authorize
              </a>
            )}
          </div>
        </div>
      ) : (
        oauthConfigured && (
          <div className="mt-3">
            <a href="/api/oauth/gmail/start" className="btn-cosmic inline-flex items-center gap-2 text-sm">
              <Mail size={15} /> Connect Gmail
            </a>
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              You&apos;ll authorize read + label access. JobScout never sends mail from your account —
              it only reads Upwork alerts and labels them processed.
            </p>
          </div>
        )
      )}
    </section>
  );
}

function fmtDate(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const h = Math.round(ms / 3_600_000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  } catch { return iso; }
}
