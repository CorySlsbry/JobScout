// Per-user feed tailoring controls. Lives on /settings.
//
// Drives the listJobs filter chain + the alert webhook fan-out. All fields
// optional — empty = "no opinion" (no filter applied). Posts to
// saveSearchTailoringAction.

import { saveSearchTailoringAction } from "@/app/actions";
import { SlidersHorizontal, Filter, Bell, BellOff, Webhook } from "lucide-react";
import type { Profile, JobSource } from "@/lib/types";

const ALL_SOURCES: Array<{ key: JobSource; label: string }> = [
  { key: "linkedin",     label: "LinkedIn" },
  { key: "indeed",       label: "Indeed" },
  { key: "ziprecruiter", label: "ZipRecruiter" },
  { key: "jsearch",      label: "JSearch" },
  { key: "google_jobs",  label: "Google Jobs" },
  { key: "greenhouse",   label: "Greenhouse" },
  { key: "ashby",        label: "Ashby" },
  { key: "lever",        label: "Lever" },
  { key: "ksl",          label: "KSL" },
];

export default function SearchTailoringCard({ profile }: { profile: Profile }) {
  // empty enabled_sources means "all sources allowed" — match that here so
  // the checkboxes start checked when the user hasn't constrained anything.
  const enabledSet = new Set<JobSource>(
    (profile.enabled_sources && profile.enabled_sources.length > 0)
      ? profile.enabled_sources
      : ALL_SOURCES.map((s) => s.key)
  );

  return (
    <section className="glass rounded-2xl p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)] flex items-center gap-1.5">
        <SlidersHorizontal size={12} /> Search tailoring
      </h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Shape your feed: hide noise, lock to specific titles, cap required experience, pipe alerts to Slack/Discord.
      </p>

      <form action={saveSearchTailoringAction} className="mt-4 space-y-5 text-sm">
        {/* ── Target titles ─────────────────────────────────────── */}
        <div>
          <label htmlFor="target_titles" className="font-semibold inline-flex items-center gap-1.5">
            <Filter size={13} className="text-[var(--accent-2)]" /> Target titles
          </label>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            Comma- or newline-separated. Substring match on job.title. Empty = no title filter.
          </p>
          <textarea
            id="target_titles" name="target_titles"
            rows={2}
            defaultValue={(profile.target_titles ?? []).join("\n")}
            placeholder="Solutions Architect&#10;Forward Deployed Engineer&#10;Workflow Engineer"
            className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent-2)]"
          />
        </div>

        {/* ── Keyword include ──────────────────────────────────── */}
        <div>
          <label htmlFor="keyword_include" className="font-semibold">Keyword include (job must mention ≥1)</label>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            Comma- or newline-separated. Description must contain at least one. Empty = no filter.
          </p>
          <textarea
            id="keyword_include" name="keyword_include"
            rows={2}
            defaultValue={(profile.keyword_include ?? []).join("\n")}
            placeholder="kubernetes&#10;rag&#10;agentic"
            className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent-2)]"
          />
        </div>

        {/* ── Years of experience ──────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="years_experience" className="font-semibold">Your YoE</label>
            <input
              id="years_experience" name="years_experience"
              type="number" min={0} max={50} step={1}
              defaultValue={profile.years_experience ?? ""}
              placeholder="7"
              className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 outline-none focus:border-[var(--accent-2)]"
            />
          </div>
          <div>
            <label htmlFor="max_required_years" className="font-semibold">Hide jobs requiring &gt;</label>
            <input
              id="max_required_years" name="max_required_years"
              type="number" min={0} max={30} step={1}
              defaultValue={profile.max_required_years ?? ""}
              placeholder="10"
              className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 outline-none focus:border-[var(--accent-2)]"
            />
            <p className="text-[10px] text-[var(--muted)] mt-1">Empty = don&apos;t filter on experience requirement.</p>
          </div>
        </div>

        {/* ── URL pattern blacklist ────────────────────────────── */}
        <div>
          <label htmlFor="blacklist_url_patterns" className="font-semibold">URL pattern blacklist</label>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            Substring match on job URL. Kills aggregator spam (lensa.com, indeed-redirect, etc.). Comma- or newline-separated.
          </p>
          <textarea
            id="blacklist_url_patterns" name="blacklist_url_patterns"
            rows={2}
            defaultValue={(profile.blacklist_url_patterns ?? []).join("\n")}
            placeholder="lensa.com&#10;jobspresso.co&#10;jora.com"
            className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent-2)]"
          />
        </div>

        {/* ── Enabled sources (per-board on/off) ───────────────── */}
        <div>
          <p className="font-semibold">Boards</p>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">All checked = all boards. Uncheck to silence noisy sources.</p>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {ALL_SOURCES.map((s) => (
              <label key={s.key} className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  name={`src_${s.key}`}
                  defaultChecked={enabledSet.has(s.key)}
                  className="accent-[var(--accent-2)]"
                />
                <span className="text-xs">{s.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ── Webhook fan-out ──────────────────────────────────── */}
        <div className="border-t border-[var(--border)] pt-4">
          <p className="font-semibold inline-flex items-center gap-1.5">
            <Webhook size={13} className="text-[var(--accent-2)]" /> High-match webhooks
          </p>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            Optional. We POST a JSON payload when a 90+ match arrives. Additive to PWA push.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2">
            <input
              name="slack_webhook_url" type="url"
              defaultValue={profile.slack_webhook_url ?? ""}
              placeholder="Slack incoming-webhook URL (https://hooks.slack.com/services/…)"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-xs font-mono outline-none focus:border-[var(--accent-2)]"
            />
            <input
              name="discord_webhook_url" type="url"
              defaultValue={profile.discord_webhook_url ?? ""}
              placeholder="Discord webhook URL (https://discord.com/api/webhooks/…)"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-xs font-mono outline-none focus:border-[var(--accent-2)]"
            />
          </div>
        </div>

        {/* ── Custom job sources ──────────────────────────────── */}
        <div className="border-t border-[var(--border)] pt-4">
          <label htmlFor="custom_sources" className="font-semibold">Custom job sources (Greenhouse / Ashby / Lever)</label>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            Add the org slug from any company&apos;s careers page. Format: <code className="bg-[var(--bg-elev-2)] rounded px-1 py-0.5 text-[10px]">kind|slug</code> — one per line.
            Examples:{" "}
            <code className="bg-[var(--bg-elev-2)] rounded px-1 py-0.5 text-[10px]">greenhouse|anthropic</code>,{" "}
            <code className="bg-[var(--bg-elev-2)] rounded px-1 py-0.5 text-[10px]">ashby|vellum-ai</code>,{" "}
            <code className="bg-[var(--bg-elev-2)] rounded px-1 py-0.5 text-[10px]">lever|stripe</code>. The cron picks these up + folds them into the shared pool.
          </p>
          <textarea
            id="custom_sources" name="custom_sources"
            rows={3}
            defaultValue={(profile.custom_sources ?? []).map((s) => `${s.kind}|${s.slug}`).join("\n")}
            placeholder="greenhouse|anthropic&#10;ashby|vellum-ai&#10;lever|stripe"
            className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent-2)]"
          />
        </div>

        {/* ── Quiet hours ──────────────────────────────────────── */}
        <div className="border-t border-[var(--border)] pt-4">
          <p className="font-semibold inline-flex items-center gap-1.5">
            <BellOff size={13} className="text-[var(--accent-2)]" /> Quiet hours
          </p>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            Don&apos;t push between these hours (24h clock, server UTC for now). Empty = always push.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[var(--muted)]" htmlFor="quiet_hours_start">Start</label>
              <input
                id="quiet_hours_start" name="quiet_hours_start"
                type="number" min={0} max={23} step={1}
                defaultValue={profile.quiet_hours_start ?? ""}
                placeholder="22"
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 outline-none focus:border-[var(--accent-2)]"
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--muted)]" htmlFor="quiet_hours_end">End</label>
              <input
                id="quiet_hours_end" name="quiet_hours_end"
                type="number" min={0} max={23} step={1}
                defaultValue={profile.quiet_hours_end ?? ""}
                placeholder="7"
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 outline-none focus:border-[var(--accent-2)]"
              />
            </div>
          </div>
        </div>

        <button type="submit" className="btn-cosmic w-full inline-flex items-center justify-center gap-1.5">
          <Bell size={14} /> Save tailoring
        </button>
      </form>
    </section>
  );
}
