// Transactional email workflow templates + matchers.
//
// Each workflow has:
//   • a `match(user)` predicate that returns true when the workflow should fire
//   • a `build(user)` template that returns { subject, text, html }
//   • a `stampField` on the User row that marks "already sent" so we don't re-fire
//
// The cron sweep (/api/cron/email-workflows) iterates every workflow over every
// user. Cheap: one Firestore query, in-memory match, parallel sends.
//
// Templates intentionally light on copy — they're branded but neutral. Cory
// will iterate copy after first batch hits real signups. The subject lines
// are tuned for opening (specific outcome + low-pressure language).

import type { User } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const SITE = "https://jobscout-hq.com";

export type WorkflowEmail = { subject: string; text: string; html: string };

export type EmailWorkflow = {
  /** Stable id; also used in event/audit logs. */
  id: string;
  /** Field on User that we stamp after sending. */
  stampField: keyof Pick<User, "welcome_sent_at" | "onboarding_nudge_sent_at" | "upgrade_nudge_sent_at" | "dunning_sent_at" | "comeback_sent_at">;
  /** Returns true iff the workflow should fire for this user right now. */
  match: (user: User, ctx: WorkflowContext) => boolean;
  /** Build the email. The user.display_name + email are available. */
  build: (user: User) => WorkflowEmail;
};

export type WorkflowContext = {
  now: number;          // Date.now() at sweep start
  /** Optional: hint that the user is currently past-due on Stripe (drives dunning trigger). */
  isPastDue?: boolean;
};

function firstName(user: User): string {
  return (user.display_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "there").trim();
}

function ageMs(iso: string | null | undefined, now: number): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return now - t;
}

function htmlShell(bodyHtml: string): string {
  const bg = "#0a0613", panel = "#131022", fg = "#f5f3ff", muted = "#8b85a8", accent2 = "#a855f7";
  return `<!doctype html><html><body style="margin:0;padding:0;background:${bg};font-family:-apple-system,Segoe UI,Inter,sans-serif;color:${fg}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${panel};border:1px solid #2d2640;border-radius:18px;padding:32px 28px">
          <tr><td style="font-size:18px;font-weight:700;color:${accent2};padding-bottom:18px">✦ JobScout</td></tr>
          ${bodyHtml}
          <tr><td style="padding-top:24px;border-top:1px solid #2d2640;color:${muted};font-size:11px;line-height:1.6">
            JobScout · <a href="${SITE}" style="color:${muted}">jobscout-hq.com</a> · <a href="${SITE}/settings" style="color:${muted}">manage email prefs</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

// ── Workflows ─────────────────────────────────────────────────────────

export const WELCOME: EmailWorkflow = {
  id: "welcome",
  stampField: "welcome_sent_at",
  match: (u, ctx) => !u.welcome_sent_at && ageMs(u.created_at, ctx.now) <= 2 * HOUR,
  build: (u) => ({
    subject: "Welcome to JobScout — get your phone working for you",
    text:
`Hi ${firstName(u)},

Thanks for signing up. JobScout is now scanning LinkedIn, Indeed, Glassdoor, Greenhouse, Ashby, Lever, and ZipRecruiter against your profile every 2 hours.

Next 3 steps to get the most out of it:
1. Drop your resume → ${SITE}/settings (tailoring runs against it)
2. Install JobScout on your phone (Add to Home Screen) and allow notifications
3. Set your salary floor + target city in Settings — anything below gets filtered

When a 90+ match posts, your phone vibrates. Apply within 30 minutes — that's when callback rates are 3× higher.

— Cory`,
    html: htmlShell(`<tr><td style="font-size:24px;font-weight:700;line-height:1.3;padding-bottom:14px">
      Welcome ${firstName(u)} — get your phone working for you.
    </td></tr>
    <tr><td style="font-size:14px;line-height:1.6;color:#cfc8e3;padding-bottom:16px">
      JobScout is now scanning 7 boards against your profile every 2 hours. When a 90+ match posts, your phone vibrates. Apply within 30 minutes — that's when callback rates are 3× higher.
    </td></tr>
    <tr><td style="font-size:14px;line-height:1.7;color:#cfc8e3">
      <strong>Next 3 steps:</strong><br>
      1. Drop your resume — <a href="${SITE}/settings" style="color:#a855f7">/settings</a><br>
      2. Install JobScout on your phone (Add to Home Screen + allow notifications)<br>
      3. Set salary floor + target city
    </td></tr>
    <tr><td style="padding-top:22px">
      <a href="${SITE}/onboarding" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#06b6d4);color:white;padding:12px 22px;border-radius:14px;font-weight:700;text-decoration:none">Finish setup →</a>
    </td></tr>`),
  }),
};

export const ONBOARDING_NUDGE: EmailWorkflow = {
  id: "onboarding_nudge",
  stampField: "onboarding_nudge_sent_at",
  match: (u, ctx) =>
    !u.onboarded
    && !u.onboarding_nudge_sent_at
    && ageMs(u.created_at, ctx.now) >= 1 * DAY
    && ageMs(u.created_at, ctx.now) <= 5 * DAY,
  build: (u) => ({
    subject: "You're 30 seconds from your first 90+ match",
    text:
`Hi ${firstName(u)},

You signed up but haven't finished onboarding yet. Without a resume + target settings JobScout can't score jobs for you.

Three fields, 30 seconds:
  • Paste your resume
  • Salary floor (we'll filter out anything below)
  • Target city / remote pref

Then your phone starts doing the work.

${SITE}/onboarding

— Cory`,
    html: htmlShell(`<tr><td style="font-size:22px;font-weight:700;line-height:1.3;padding-bottom:14px">
      You're 30 seconds from your first 90+ match.
    </td></tr>
    <tr><td style="font-size:14px;line-height:1.6;color:#cfc8e3;padding-bottom:16px">
      You signed up but haven't finished onboarding yet. Without a resume + your target settings, JobScout can't score jobs for you.
    </td></tr>
    <tr><td style="font-size:14px;line-height:1.7;color:#cfc8e3">
      Three fields, 30 seconds:<br>
      • Paste your resume<br>
      • Salary floor (we filter below it)<br>
      • Target city / remote preference
    </td></tr>
    <tr><td style="padding-top:22px">
      <a href="${SITE}/onboarding" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#06b6d4);color:white;padding:12px 22px;border-radius:14px;font-weight:700;text-decoration:none">Finish in 30s →</a>
    </td></tr>`),
  }),
};

export const UPGRADE_NUDGE: EmailWorkflow = {
  id: "upgrade_nudge",
  stampField: "upgrade_nudge_sent_at",
  match: (u, ctx) =>
    u.plan === "free"
    && u.onboarded
    && !u.upgrade_nudge_sent_at
    && ageMs(u.created_at, ctx.now) >= 7 * DAY
    && ageMs(u.created_at, ctx.now) <= 14 * DAY,
  build: (u) => ({
    subject: "You've hit your free-tier ceiling on JobScout",
    text:
`Hi ${firstName(u)},

You've been on JobScout a week. Quick gut-check: are you tailoring resumes per posting?

Free gives you 3 tailored resumes per month + 2 cover letters. Pro ($19/mo) unlocks unlimited, plus the Upwork bidder Chrome extension + Gmail inbox watcher + Interview Story Bank.

If you're applying to 5+ jobs a week, Pro pays for itself in 2 hours of saved manual rewriting.

Start Pro → ${SITE}/pricing

Cancel any time, no card to start a trial, 30-day callback guarantee.

— Cory`,
    html: htmlShell(`<tr><td style="font-size:22px;font-weight:700;line-height:1.3;padding-bottom:14px">
      You've hit your free-tier ceiling.
    </td></tr>
    <tr><td style="font-size:14px;line-height:1.6;color:#cfc8e3;padding-bottom:14px">
      Free gives you 3 tailored resumes/month + 2 cover letters. Pro ($19/mo) unlocks unlimited + the Upwork bidder + the Gmail watcher + the Story Bank.
    </td></tr>
    <tr><td style="font-size:14px;line-height:1.6;color:#cfc8e3;padding-bottom:14px">
      If you're applying to 5+ jobs a week, Pro pays for itself in 2 hours of saved manual rewriting.
    </td></tr>
    <tr><td style="padding-top:18px">
      <a href="${SITE}/pricing" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#06b6d4);color:white;padding:12px 22px;border-radius:14px;font-weight:700;text-decoration:none">Start Pro →</a>
    </td></tr>
    <tr><td style="font-size:11px;color:#8b85a8;padding-top:14px">
      No card to start. Cancel any time. 30-day callback guarantee.
    </td></tr>`),
  }),
};

export const DUNNING: EmailWorkflow = {
  id: "dunning",
  stampField: "dunning_sent_at",
  match: (u, ctx) =>
    (u.subscription_status === "past_due" || u.subscription_status === "unpaid" || !!ctx.isPastDue)
    && !u.dunning_sent_at,
  build: (u) => ({
    subject: "Your JobScout payment didn't go through",
    text:
`Hi ${firstName(u)},

Quick heads-up — your last payment didn't clear, so your subscription is past-due. Most of the time this is an expired card or a bank hold; Stripe will retry automatically.

Update your card here: ${SITE}/settings (Billing → Manage)

If you intended to cancel, no action needed — access ends at period close. If you want to keep going, the update takes 30 seconds and JobScout stays live.

— Cory`,
    html: htmlShell(`<tr><td style="font-size:22px;font-weight:700;line-height:1.3;padding-bottom:14px">
      Your JobScout payment didn't go through.
    </td></tr>
    <tr><td style="font-size:14px;line-height:1.6;color:#cfc8e3;padding-bottom:14px">
      Quick heads-up — your last payment didn't clear, so your subscription is past-due. Usually an expired card or a bank hold. Stripe will retry automatically.
    </td></tr>
    <tr><td style="font-size:14px;line-height:1.6;color:#cfc8e3;padding-bottom:14px">
      If you intended to cancel, no action needed. If you want to keep going, the update takes 30 seconds.
    </td></tr>
    <tr><td style="padding-top:18px">
      <a href="${SITE}/settings" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#06b6d4);color:white;padding:12px 22px;border-radius:14px;font-weight:700;text-decoration:none">Update card →</a>
    </td></tr>`),
  }),
};

export const COMEBACK: EmailWorkflow = {
  id: "comeback",
  stampField: "comeback_sent_at",
  match: (u, ctx) =>
    !u.comeback_sent_at
    && u.onboarded
    && ageMs(u.last_seen_at, ctx.now) >= 30 * DAY
    && ageMs(u.last_seen_at, ctx.now) <= 90 * DAY,
  build: (u) => ({
    subject: "Two new JobScout features since you last visited",
    text:
`Hi ${firstName(u)},

You haven't checked JobScout in a while. Some things that shipped since you were last in:

• Search tailoring — target titles, keyword include/exclude, experience-level cap, URL pattern blacklist. Lock your feed to exactly what you want.
• AI Support Chat + Bug/Feedback buttons — answers in seconds, no support form to fill out.
• Slack + Discord webhook alerts — high-match jobs ping your team channel.
• /security + /status pages, GDPR data export, account self-delete.

Open it again → ${SITE}/feed

— Cory`,
    html: htmlShell(`<tr><td style="font-size:22px;font-weight:700;line-height:1.3;padding-bottom:14px">
      Two new JobScout features since you last visited.
    </td></tr>
    <tr><td style="font-size:14px;line-height:1.7;color:#cfc8e3">
      • <strong>Search tailoring</strong> — target titles + keyword filter + experience cap + URL blacklist<br>
      • <strong>AI Support Chat</strong> — bottom-left button, answers in seconds<br>
      • <strong>Slack + Discord</strong> webhook alerts for high-match jobs<br>
      • <strong>GDPR data export</strong> + account self-delete
    </td></tr>
    <tr><td style="padding-top:22px">
      <a href="${SITE}/feed" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#06b6d4);color:white;padding:12px 22px;border-radius:14px;font-weight:700;text-decoration:none">Open JobScout →</a>
    </td></tr>`),
  }),
};

export const ALL_WORKFLOWS: EmailWorkflow[] = [WELCOME, ONBOARDING_NUDGE, UPGRADE_NUDGE, DUNNING, COMEBACK];
