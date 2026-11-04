import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/db";
import { listResumes } from "@/lib/resumes";
import PushSubscribeCard from "@/components/PushSubscribeCard";
import SyncButton from "@/components/SyncButton";
import ResumeManager from "@/components/ResumeManager";
import BannedCompaniesCard from "@/components/BannedCompaniesCard";
import SearchTailoringCard from "@/components/SearchTailoringCard";
import UpworkSourcesCard from "@/components/UpworkSourcesCard";
import JobSearchConfigCard from "@/components/JobSearchConfigCard";
import AutoPilotCard from "@/components/AutoPilotCard";
import AccountDangerZone from "@/components/AccountDangerZone";
import ExtensionCard from "@/components/ExtensionCard";
import UpworkFiltersCard from "@/components/UpworkFiltersCard";
import CareerContextCard from "@/components/CareerContextCard";
import CalibrationCard from "@/components/CalibrationCard";
import AssessmentsCard from "@/components/AssessmentsCard";
import ClearJobsCard from "@/components/ClearJobsCard";
import BillingCard from "@/components/BillingCard";
import { listAssessments } from "@/lib/assessments";
import { isStripeConfigured } from "@/lib/stripe";
import GmailConnectionCard from "@/components/GmailConnectionCard";
import LogoutButton from "@/components/LogoutButton";
import GlassTile from "@/components/GlassTile";
import RoleHero from "@/components/RoleHero";
import RoleSection from "@/components/RoleSection";
import { getSessionUser } from "@/lib/auth";
import { DEFAULT_UPWORK_FILTERS } from "@/lib/types";
import { saveSettingsAction, saveDigestAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/signin");
  const [profile, resumes, assessments] = await Promise.all([
    getProfile(sessionUser.uid),
    listResumes(sessionUser.uid),
    listAssessments(sessionUser.uid),
  ]);
  const vapidPub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 pt-5 pb-28">
      <nav className="flex items-center justify-between gap-2 mb-4">
        <Link href="/" className="text-sm text-fg-muted hover:text-fg motion-fast ease-soft transition">
          ← Home
        </Link>
        {sessionUser && <LogoutButton />}
      </nav>

      <RoleHero
        eyebrow="JobScout · Settings"
        title="Settings"
        highlight="Settings"
        subtitle={`${sessionUser?.name ?? profile.full_name}${(sessionUser?.email ?? profile.email) ? ` · ${sessionUser?.email ?? profile.email}` : ""}`}
        right={
          sessionUser?.is_admin ? (
            <div className="glass-card px-3 py-2 text-center">
              <div className="text-tiny uppercase tracking-wider text-fg-muted">Role</div>
              <div className="mt-1 font-mono text-sm text-gradient">Admin</div>
            </div>
          ) : undefined
        }
      />

      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        <GlassTile
          label="Push notifications"
          value={<span className="text-sm">{profile.push_subscription ? "On" : "Off"}</span>}
          sub={profile.push_subscription ? "live" : "set up below"}
          dotColor={profile.push_subscription ? "#34d399" : "#6f6890"}
        />
        <GlassTile
          label="Email digest"
          value={<span className="text-sm capitalize">{profile.digest_frequency ?? "daily"}</span>}
          sub={`≥ ${profile.digest_min_score ?? 70} match score`}
          dotColor="#c084fc"
        />
        <GlassTile
          label="Resumes"
          value={<span className="text-sm">{resumes.length}</span>}
          sub={resumes.find((r) => r.is_active)?.name ?? "no active resume"}
          dotColor="#38bdf8"
        />
      </div>

      <RoleSection title="Sync" lede="Pulls fresh jobs from all sources and re-scores against your resume.">
        <SyncButton />
      </RoleSection>

      <PushSubscribeCard
        vapidPublicKey={vapidPub}
        hasSubscription={!!profile.push_subscription}
      />

      <RoleSection
        title="Job sources"
        lede="What gets pulled into your feed — the search terms + locations sent to the job boards. This is the front door; the tailoring below is the filter."
      >
        <JobSearchConfigCard profile={profile} />
      </RoleSection>

      <RoleSection
        title="Auto-Pilot"
        lede="Auto-prepare a tailored resume + cover letter for every high-match job, ready to apply in one tap."
      >
        <AutoPilotCard profile={profile} />
      </RoleSection>

      <RoleSection
        title="Search tailoring"
        lede="Per-user feed shaping. Hide noise, lock to specific titles, cap required experience, pipe alerts to Slack/Discord."
      >
        <SearchTailoringCard profile={profile} />
      </RoleSection>

      <RoleSection
        title="Upwork sources"
        lede="Paste your Upwork RSS feed URLs. We poll hourly, score every new job, and stage matches at /upwork."
      >
        <UpworkSourcesCard profile={profile} />
      </RoleSection>

      <RoleSection title="Search preferences" lede="Salary floor, remote preference, and keyword filters used by the daily sync.">
        <form action={saveSettingsAction} className="space-y-3 text-sm">
          <Field label="Salary floor (USD/yr)">
            <input
              name="salary_floor"
              type="number"
              defaultValue={profile.salary_floor ?? 100000}
              min={0}
              step={5000}
              className="form-input"
            />
          </Field>
          <Field label="Remote preference">
            <select
              name="remote_pref"
              defaultValue={profile.remote_pref ?? "remote_first"}
              className="form-input"
            >
              <option value="remote_only">Remote only</option>
              <option value="remote_first">Remote first (St George counts as remote-equivalent)</option>
              <option value="hybrid_ok">Hybrid OK</option>
              <option value="onsite_ok">Onsite OK</option>
            </select>
          </Field>
          <Field label="Resume keywords (comma-separated)">
            <textarea
              name="resume_keywords"
              defaultValue={(profile.resume_keywords ?? []).join(", ")}
              rows={3}
              className="form-input font-mono text-xs"
            />
          </Field>
          <Field label="Excluded keywords (zero score if found in title/desc)">
            <input
              name="excluded_keywords"
              defaultValue={(profile.excluded_keywords ?? []).join(", ")}
              className="form-input"
            />
          </Field>
          <Field label="Banned companies (exact-ish match — freelance/agency platforms)">
            <textarea
              name="excluded_companies"
              defaultValue={(profile.excluded_companies ?? []).join(", ")}
              rows={3}
              className="form-input font-mono text-xs"
            />
          </Field>
          <button type="submit" className="btn-premium">Save preferences</button>
        </form>
      </RoleSection>

      <DigestCard
        frequency={profile.digest_frequency ?? "daily"}
        minScore={profile.digest_min_score ?? 70}
        lastSentAt={profile.digest_last_sent_at ?? null}
        smtpConfigured={!!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)}
      />

      <ResumeManager initial={resumes} />

      <CareerContextCard
        careerStory={profile.career_story_md ?? null}
        avoid={profile.avoid_md ?? null}
        growthGoals={profile.growth_goals_md ?? null}
      />

      <CalibrationCard
        tuningPrompt={profile.tuning_prompt_md ?? null}
        levelUp={profile.level_up_targets ?? []}
        stayWith={profile.stay_with_targets ?? []}
      />

      <AssessmentsCard initial={assessments} />

      {sessionUser?.record && (
        <BillingCard
          plan={sessionUser.record.plan}
          status={sessionUser.record.subscription_status}
          periodEnd={sessionUser.record.subscription_current_period_end}
          hasCustomer={!!sessionUser.record.stripe_customer_id}
          stripeConfigured={isStripeConfigured()}
          isAdmin={sessionUser.is_admin}
        />
      )}

      <BannedCompaniesCard initial={profile.excluded_companies ?? []} />

      {sessionUser?.is_admin && (
        <>
          <ExtensionCard
            hasToken={!!profile.extension_token_hash}
            createdAt={profile.extension_token_created_at ?? null}
          />
          <GmailConnectionCard
            connected={!!profile.gmail_refresh_token}
            connectedEmail={profile.gmail_connected_email ?? null}
            connectedAt={profile.gmail_connected_at ?? null}
            lastRun={profile.upwork_inbox_last_run ?? null}
            oauthConfigured={!!process.env.GMAIL_OAUTH_CLIENT_ID}
          />
          <UpworkFiltersCard filters={profile.upwork_filters ?? DEFAULT_UPWORK_FILTERS} />
          <ClearJobsCard />
        </>
      )}

      <ConnectionsCard
        linkedinConfigured={!!process.env.LINKEDIN_CLIENT_ID}
        anthropicConfigured={!!process.env.ANTHROPIC_API_KEY}
      />

      <RoleSection title="Status" lede="Live config — what's wired up vs what needs your attention.">
        <ul className="space-y-1 text-sm text-fg-muted">
          <StatusRow label="Firestore" ok={!!process.env.GOOGLE_CLOUD_PROJECT} value={process.env.GOOGLE_CLOUD_PROJECT ?? "in-memory mode"} />
          <StatusRow label="JSearch API" ok={!!process.env.JSEARCH_RAPIDAPI_KEY} value={process.env.JSEARCH_RAPIDAPI_KEY ? "key set" : "missing JSEARCH_RAPIDAPI_KEY"} />
          <StatusRow label="VAPID push" ok={!!vapidPub} value={vapidPub ? "set" : "missing"} />
          <StatusRow label="Claude (resume tailor)" ok={!!process.env.ANTHROPIC_API_KEY} value={process.env.ANTHROPIC_API_KEY ? "ready" : "ANTHROPIC_API_KEY not set"} />
          <StatusRow label="LinkedIn OAuth" ok={!!process.env.LINKEDIN_CLIENT_ID} value={process.env.LINKEDIN_CLIENT_ID ? "configured" : "register at linkedin.com/developers/apps"} />
        </ul>
      </RoleSection>

      <RoleSection title="Account" lede="GDPR-compliant data export + permanent account deletion.">
        <AccountDangerZone email={sessionUser?.email ?? profile.email ?? null} />
      </RoleSection>
    </div>
  );
}

function DigestCard({
  frequency, minScore, lastSentAt, smtpConfigured,
}: {
  frequency: "off" | "daily" | "weekly";
  minScore: number;
  lastSentAt: string | null;
  smtpConfigured: boolean;
}) {
  return (
    <RoleSection title="Email digest" lede="Backup channel for if you don't install the PWA. Daily or weekly summary of jobs above your match threshold. Sent via your Google Workspace inbox.">
      {!smtpConfigured && (
        <div className="mb-3 rounded-card border border-warning/30 bg-warning/10 p-3 text-xs text-warning space-y-1.5">
          <p>⚠️ SMTP not configured. To activate with Workspace inbox:</p>
          <ol className="list-decimal pl-4 space-y-0.5 text-fg-muted">
            <li>Visit <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="underline text-warning">myaccount.google.com/security</a> and enable 2-Step Verification.</li>
            <li>Visit <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline text-warning">myaccount.google.com/apppasswords</a>, create an App Password named &quot;JobScout&quot;.</li>
            <li>Set on Cloud Run: <code className="font-mono">SMTP_HOST=smtp.gmail.com</code>, <code className="font-mono">SMTP_PORT=587</code>, <code className="font-mono">SMTP_USER=cory@noadappsutah.com</code>, <code className="font-mono">SMTP_PASS=&lt;App Password&gt;</code>, <code className="font-mono">SMTP_FROM=&quot;JobScout &lt;cory@noadappsutah.com&gt;&quot;</code>.</li>
          </ol>
        </div>
      )}
      <form action={saveDigestAction} className="space-y-3 text-sm">
        <Field label="Frequency">
          <select name="digest_frequency" defaultValue={frequency} className="form-input">
            <option value="off">Off — push notifications only</option>
            <option value="daily">Daily — every morning</option>
            <option value="weekly">Weekly — Sunday afternoon roundup</option>
          </select>
        </Field>
        <Field label="Minimum match score (0–100)">
          <input name="digest_min_score" type="number" min={0} max={100} step={5} defaultValue={minScore} className="form-input" />
        </Field>
        <button type="submit" className="btn-premium-outline">Save digest preferences</button>
        {lastSentAt && (
          <p className="text-tiny text-fg-faint">Last sent: {relTime(lastSentAt)}</p>
        )}
      </form>
    </RoleSection>
  );
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.round(ms / (1000 * 60 * 60));
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function ConnectionsCard({ linkedinConfigured, anthropicConfigured }: { linkedinConfigured: boolean; anthropicConfigured: boolean }) {
  return (
    <RoleSection title="Connections" lede="External services wired into JobScout. Most of the AI value lives in the Claude connection.">
      <ul className="space-y-3">
        <li className="flex items-center justify-between gap-3 rounded-card border border-border bg-bg-elev/60 p-3">
          <div>
            <p className="font-semibold text-fg">LinkedIn — sign-in</p>
            <p className="text-xs text-fg-muted">OAuth sign-in to auto-fill profile + verify identity. Setup: register an app at linkedin.com/developers/apps.</p>
          </div>
          {linkedinConfigured ? (
            <a href="/api/oauth/linkedin/start" className="btn-premium text-sm">Connect</a>
          ) : (
            <span className="text-xs text-warning font-medium">Setup needed</span>
          )}
        </li>
        <li className="flex items-center justify-between gap-3 rounded-card border border-border bg-bg-elev/60 p-3">
          <div>
            <p className="font-semibold text-fg">Claude — resume tailor, cover letter, Upwork bidder</p>
            <p className="text-xs text-fg-muted">Powers the AI buttons across the app. ~$0.07 / tailor, ~$0.04 / cover letter, ~$0.001 / Upwork score.</p>
          </div>
          <span className={`text-xs font-medium ${anthropicConfigured ? "text-success" : "text-warning"}`}>
            {anthropicConfigured ? "✓ Ready" : "Setup needed"}
          </span>
        </li>
      </ul>
    </RoleSection>
  );
}

function StatusRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1">
      <span>{label}</span>
      <span className={`font-mono text-xs ${ok ? "text-success" : "text-warning"}`}>
        {ok ? "✅" : "⚠️"} {value}
      </span>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-fg-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
