// Workflow runner — tailored email + in-app sequences for JobScout users.
//
// The catalog below documents every planned workflow. Each one is either
// FIRED (wired into the codebase, runs on a real event) or PLANNED (catalog
// entry only, exists so we can show the roadmap in /admin/workflows and
// design the data model without shipping incomplete behavior).
//
// Why a registry pattern? Workflows compose well — onboarding fires the
// welcome email; billing-failed fires the dunning sequence. Keeping the
// catalog in a single source-of-truth (this file) means /admin/workflows
// always reflects reality.

import { getMailer, FROM_DEFAULT } from "./email";
import { buildWelcomeEmail } from "./email";
import { getDb, COL } from "./firestore";
import type { User } from "./types";

export type WorkflowId =
  | "welcome_email"
  | "onboarding_nudge_day_1"
  | "first_match_celebration"
  | "weekly_digest"
  | "upgrade_nudge_day_7"
  | "billing_past_due_dunning"
  | "referral_invite_nudge"
  | "comeback_email_day_90";

export type WorkflowTrigger = "on_signup" | "on_onboard" | "on_match" | "on_billing_event" | "scheduled" | "manual";

export type WorkflowSpec = {
  id: WorkflowId;
  name: string;
  trigger: WorkflowTrigger;
  cadence: string;          // human-readable cadence ("immediate", "24h after signup", "weekly Mondays")
  status: "live" | "planned";
  description: string;
};

// The roadmap. Each FIRES on a defined event; PLANNED entries surface in
// /admin/workflows so the catalog is always honest.
export const WORKFLOW_CATALOG: ReadonlyArray<WorkflowSpec> = [
  {
    id: "welcome_email",
    name: "Welcome email",
    trigger: "on_signup",
    cadence: "immediate",
    status: "live",
    description: "First-touch email after signup. Sets expectations, points to onboarding, mentions the refer-2-for-20%-off loop.",
  },
  {
    id: "onboarding_nudge_day_1",
    name: "Onboarding nudge (day 1)",
    trigger: "scheduled",
    cadence: "24h after signup, only if !onboarded",
    status: "planned",
    description: "If the user signed up but didn't upload a resume in 24h, send a gentle 'here's how to finish setup' email.",
  },
  {
    id: "first_match_celebration",
    name: "First 90+ match celebration",
    trigger: "on_match",
    cadence: "fires once per user, the first time a 90+ match lands",
    status: "planned",
    description: "Push + email celebrating their first high-match. Builds the 'JobScout works' moment.",
  },
  {
    id: "weekly_digest",
    name: "Weekly digest",
    trigger: "scheduled",
    cadence: "weekly (Sundays 7pm local)",
    status: "live",
    description: "Top jobs for the week, grouped by score band. Already wired at /api/cron/digest.",
  },
  {
    id: "upgrade_nudge_day_7",
    name: "Upgrade nudge (day 7)",
    trigger: "scheduled",
    cadence: "7 days after signup, only if still on free plan",
    status: "planned",
    description: "Highlights features the user hit the free-tier cap on, points to /pricing.",
  },
  {
    id: "billing_past_due_dunning",
    name: "Billing past-due dunning",
    trigger: "on_billing_event",
    cadence: "1h after Stripe past_due, again at 48h, again at 5d",
    status: "planned",
    description: "Three-step dunning sequence when a subscription falls past_due. Includes Stripe customer portal link.",
  },
  {
    id: "referral_invite_nudge",
    name: "Referral invite nudge",
    trigger: "scheduled",
    cadence: "3 days after first job saved",
    status: "planned",
    description: "'You'd save 20%/mo if 2 friends sign up' — gives the user their refer link.",
  },
  {
    id: "comeback_email_day_90",
    name: "Comeback email (day 90)",
    trigger: "scheduled",
    cadence: "90 days of no activity",
    status: "planned",
    description: "Re-engagement email with what's new since they last logged in.",
  },
];

// ─────────────────────────────────────────────────────────────────────
// Triggers — wire these from the relevant route/cron.
// ─────────────────────────────────────────────────────────────────────

const APP_URL = process.env.OAUTH_BASE_URL ?? "https://jobscout-hq.com";

/** Fired by /api/profile/onboarding on the first profile-create. Sends the welcome email. */
export async function runOnSignup(args: { uid: string; email: string; full_name: string; refer_code?: string }): Promise<void> {
  const mailer = getMailer();
  if (!mailer) return;   // SMTP not configured; no-op so signup doesn't fail
  if (!args.email) return;

  try {
    const { subject, html, text } = buildWelcomeEmail({
      toName: args.full_name || "there",
      appUrl: APP_URL,
      referCode: args.refer_code,
    });
    await mailer.sendMail({
      from: FROM_DEFAULT,
      to: args.email,
      subject,
      html,
      text,
    });
    await logWorkflowRun("welcome_email", args.uid, "sent");
  } catch (e) {
    await logWorkflowRun("welcome_email", args.uid, "error", e instanceof Error ? e.message : String(e));
  }
}

/** Persist a workflow execution row so /admin/workflows can show a fire log. */
async function logWorkflowRun(id: WorkflowId, uid: string, status: "sent" | "error" | "skipped", note?: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.collection(COL.searchRuns).doc(`wf__${Date.now()}__${id}__${uid.slice(0, 8)}`).set({
      kind: "workflow",
      workflow_id: id,
      uid,
      status,
      note: note ?? null,
      created_at: new Date().toISOString(),
    });
  } catch { /* best-effort */ }
}
