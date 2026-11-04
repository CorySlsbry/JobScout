import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, MapPin, Building2, DollarSign, Clock, Sparkles } from "lucide-react";
import { getJob } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { dismissAction, saveAction, banCompanyAction, hideJobAction } from "../../actions";
import { Trash2 } from "lucide-react";
import OneTapApplyButton from "@/components/OneTapApplyButton";
import TailorResumeButton from "@/components/TailorResumeButton";
import CoverLetterButton from "@/components/CoverLetterButton";
import NegotiateButton from "@/components/NegotiateButton";
import StoryMatchButton from "@/components/StoryMatchButton";

export const dynamic = "force-dynamic";

export default async function JobDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/signin");
  const job = await getJob(sessionUser.uid, decodeURIComponent(id));
  if (!job) notFound();

  const isApplied = job.application?.status === "applied";
  const isSaved = !!job.application;
  const score = Math.round(job.match_score ?? 0);

  return (
    <div className="pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-[var(--bg)]/85 backdrop-blur-xl px-4 sm:px-6 py-3 border-b border-[var(--border-soft)]">
        <Link href="/feed" className="rounded-full p-1.5 hover:bg-[var(--bg-elev)] text-[var(--muted)] hover:text-[var(--fg)]" aria-label="Back">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 truncate text-sm text-[var(--muted)]">{job.company ?? "Unknown"}</div>
        <a
          href={job.source_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1 text-xs font-medium hover:border-[var(--accent-2)]"
        >
          Open <ExternalLink size={12} />
        </a>
      </header>

      <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-[family-name:var(--font-inter-tight)] text-xl font-bold leading-tight">{job.title}</h1>
          <div
            className="shrink-0 rounded-xl px-2.5 py-1.5 text-center font-bold"
            style={score >= 80 ? {
              background: "var(--grad-cosmic)",
              color: "white",
              boxShadow: "0 4px 12px rgba(168, 85, 247, 0.25)",
            } : score >= 60 ? {
              background: "var(--accent-soft)",
              color: "var(--accent)",
            } : {
              background: "var(--bg-elev-2)",
              color: "var(--muted)",
            }}
          >
            <div className="text-xl leading-none">{score}</div>
            <div className="text-[10px] uppercase tracking-wide opacity-80">match</div>
          </div>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <Row icon={<Building2 size={15} />} label={job.company ?? "—"} />
          <Row icon={<MapPin size={15} />} label={job.location ?? "—"} />
          <Row
            icon={<DollarSign size={15} />}
            label={formatSalary(job.salary_min, job.salary_max, job.salary_period) ?? "Salary not listed"}
          />
          {job.posted_at && (
            <Row icon={<Clock size={15} />} label={`Posted ${relTime(job.posted_at)}`} />
          )}
        </dl>

        {job.match_reasons.length > 0 && (
          <section className="glass mt-5 rounded-xl p-4 border-[var(--accent-2)]/30">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">
              <Sparkles size={13} /> Why this matched
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              {job.match_reasons.map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Description</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{job.description ?? "No description."}</p>
        </section>

        <div className="mt-8 space-y-3">
          {/* Primary action — opens the apply URL in a new tab AND marks the job applied. */}
          <OneTapApplyButton jobId={job.id} applyUrl={job.source_url} isApplied={isApplied} />

          {/* AI tools — tailored resume + cover letter, both Claude Sonnet. */}
          <div className="grid grid-cols-2 gap-2">
            <TailorResumeButton jobId={job.id} jobTitle={job.title} />
            <CoverLetterButton jobId={job.id} jobTitle={job.title} />
          </div>

          {/* Interview prep — match the story bank to this specific role. */}
          <StoryMatchButton jobId={job.id} />

          {/* Offer-stage tool — negotiate the comp. Only shown when the
              candidate has marked the job as having an offer in hand. */}
          {job.application?.status === "offer" && (
            <div className="grid grid-cols-1 gap-2">
              <NegotiateButton
                jobTitle={job.title}
                company={job.company ?? ""}
                jobDescription={job.description}
              />
            </div>
          )}

          {/* Secondary: save for later. */}
          <form action={saveAction}>
            <input type="hidden" name="job_id" value={job.id} />
            <button
              type="submit"
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] font-semibold py-2.5 px-4 active:scale-[0.98] hover:border-[var(--accent-2)] transition-all text-sm"
            >
              {isSaved ? "✓ Saved" : "Save for later"}
            </button>
          </form>

          {/* Hard-hide row: removes this job from the feed entirely.
              Different from "Not interested" (which keeps an Application row in
              'dismissed' state). Restore from /trash. */}
          <form action={hideJobAction}>
            <input type="hidden" name="job_id" value={job.id} />
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-2xl border border-[var(--border)] bg-transparent font-medium py-2 px-3 hover:border-[var(--bad)]/60 hover:text-[var(--bad)] transition-all text-xs text-[var(--muted)]"
              title="Hide from your feed (restore from /trash)"
            >
              <Trash2 size={12} /> Remove from feed
            </button>
          </form>

          <div className="grid grid-cols-2 gap-2">
            <form action={dismissAction}>
              <input type="hidden" name="job_id" value={job.id} />
              <button
                type="submit"
                aria-label="Dismiss"
                className="w-full rounded-2xl border border-[var(--border)] bg-transparent font-medium py-2 px-3 hover:border-[var(--bad)]/50 hover:text-[var(--bad)] transition-all text-xs text-[var(--muted)]"
              >
                Not interested
              </button>
            </form>
            {job.company && (
              <form action={banCompanyAction}>
                <input type="hidden" name="company" value={job.company} />
                <button
                  type="submit"
                  aria-label={`Ban ${job.company}`}
                  className="w-full rounded-2xl border border-[var(--border)] bg-transparent font-medium py-2 px-3 hover:border-[var(--bad)]/50 hover:text-[var(--bad)] transition-all text-xs text-[var(--muted)]"
                  title={`Hide all jobs from ${job.company}, forever`}
                >
                  Ban {truncate(job.company, 14)}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function Row({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[var(--muted)]">
      <span className="shrink-0">{icon}</span>
      <span className="text-[var(--fg)]">{label}</span>
    </div>
  );
}

function formatSalary(min: number | null, max: number | null, period: "year" | "month" | "hour"): string | null {
  if (!min && !max) return null;
  const k = (n: number) => `$${(n / 1000).toFixed(0)}k`;
  const suf = period === "year" ? "/yr" : period === "month" ? "/mo" : "/hr";
  if (min && max) return `${k(min)}–${k(max)}${suf}`;
  return `${k((max ?? min)!)}${suf}`;
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.round(ms / (1000 * 60 * 60));
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
