import Link from "next/link";
import { MapPin, Building2, DollarSign, Sparkles, MountainSnow } from "lucide-react";
import type { JobWithApplication } from "@/lib/types";

const SOURCE_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  ziprecruiter: "ZipRecruiter",
  ksl: "KSL",
  jsearch: "JSearch",
  google_jobs: "Google",
  other: "Other",
};

export function JobCard({ job }: { job: JobWithApplication }) {
  const score = Math.round(job.match_score ?? 0);
  const isStGeorge = (job.location ?? "").toLowerCase().includes("george");
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);

  return (
    <Link
      href={`/jobs/${encodeURIComponent(job.id)}`}
      className="glass group block rounded-2xl p-4 transition-all hover:border-[var(--accent-2)]/50 active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight line-clamp-2">{job.title}</h3>
          <p className="mt-1 text-sm text-[var(--muted)] flex items-center gap-1 min-w-0">
            <Building2 size={14} className="shrink-0" />
            <span className="truncate">{job.company ?? "Unknown company"}</span>
          </p>
        </div>
        <ScoreBadge score={score} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {isStGeorge && (
          <Pill tone="accent" icon={<MountainSnow size={12} />}>St George</Pill>
        )}
        {job.is_remote && <Pill tone="good">Remote</Pill>}
        {!job.is_remote && job.remote_kind === "hybrid" && <Pill tone="warn">Hybrid</Pill>}
        {job.location && !isStGeorge && (
          <Pill icon={<MapPin size={12} />}>{shortLocation(job.location)}</Pill>
        )}
        {salary && <Pill icon={<DollarSign size={12} />}>{salary}</Pill>}
        <Pill>{SOURCE_LABEL[job.source] ?? job.source}</Pill>
        {job.application?.status && <Pill tone="violet">{job.application.status.replace(/_/g, " ")}</Pill>}
      </div>

      {job.match_reasons.length > 0 && (
        <p className="mt-3 text-xs text-[var(--muted)] flex items-start gap-1.5 leading-snug">
          <Sparkles size={12} className="mt-0.5 shrink-0 text-[var(--accent-2)]" />
          <span className="line-clamp-2">{job.match_reasons.slice(0, 3).join(" · ")}</span>
        </p>
      )}
    </Link>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const isStrong = score >= 80;
  const isMedium = score >= 60;
  return (
    <div
      className="shrink-0 rounded-xl px-2.5 py-1.5 text-center font-bold"
      style={isStrong ? {
        background: "var(--grad-cosmic)",
        color: "white",
        boxShadow: "0 4px 12px rgba(168, 85, 247, 0.25)",
      } : isMedium ? {
        background: "var(--accent-soft)",
        color: "var(--accent)",
      } : {
        background: "var(--bg-elev-2)",
        color: "var(--muted)",
      }}
    >
      <div className="text-lg leading-none">{score}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-80">match</div>
    </div>
  );
}

type PillTone = "default" | "accent" | "good" | "warn" | "violet";
function Pill({
  children, tone = "default", icon,
}: {
  children: React.ReactNode; tone?: PillTone; icon?: React.ReactNode;
}) {
  const cls = {
    default: "bg-[var(--bg-elev-2)] text-[var(--muted)] border border-[var(--border)]",
    accent:  "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30",
    good:    "bg-[var(--good-soft)] text-[var(--good)] border border-[var(--good)]/30",
    warn:    "bg-[var(--warn-soft)] text-[var(--warn)] border border-[var(--warn)]/30",
    violet:  "bg-[var(--accent-2-soft)] text-[var(--accent-2)] border border-[var(--accent-2)]/30",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${cls}`}>
      {icon}
      <span className="truncate max-w-[150px]">{children}</span>
    </span>
  );
}

function formatSalary(min: number | null, max: number | null, period: "year" | "month" | "hour"): string | null {
  if (!min && !max) return null;
  const k = (n: number) => `$${(n / 1000).toFixed(0)}k`;
  const suf = period === "year" ? "/yr" : period === "month" ? "/mo" : "/hr";
  if (min && max) return `${k(min)}–${k(max)}${suf}`;
  return `${k((max ?? min)!)}${suf}`;
}

function shortLocation(loc: string): string {
  return loc.replace(/\s*\(.*\)\s*$/, "").trim();
}
