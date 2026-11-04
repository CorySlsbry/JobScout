// Email transport via SMTP (Google Workspace).
// Set on Cloud Run:
//   SMTP_HOST=smtp.gmail.com
//   SMTP_PORT=587
//   SMTP_USER=cory@noadappsutah.com           (the workspace address that sends)
//   SMTP_PASS=<16-char App Password>          (https://myaccount.google.com/apppasswords)
//   SMTP_FROM="JobScout <cory@noadappsutah.com>"
//
// Returns null when not configured so callers can no-op gracefully.

import nodemailer, { type Transporter } from "nodemailer";

let cached: Transporter | null = null;

export function getMailer(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  if (!cached) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    cached = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,            // 465 = implicit TLS, 587 = STARTTLS
      auth: { user, pass },
    });
  }
  return cached;
}

export const FROM_DEFAULT =
  process.env.SMTP_FROM ?? `JobScout <${process.env.SMTP_USER ?? "noreply@example.com"}>`;

export type DigestJob = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  is_remote: boolean;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: "year" | "month" | "hour";
  match_score: number | null;
  source: string;
  source_url: string;
};

const SOURCE_LABEL: Record<string, string> = {
  linkedin: "LinkedIn", indeed: "Indeed", ziprecruiter: "ZipRecruiter",
  ksl: "KSL", jsearch: "JSearch", google_jobs: "Google", other: "Other",
};

export function buildDigestEmail(args: {
  toName: string;
  jobs: DigestJob[];
  appUrl: string;
  unsubscribeUrl: string;
  range: "today" | "this week";
}): { subject: string; html: string; text: string } {
  const { toName, jobs, appUrl, unsubscribeUrl, range } = args;
  const top = jobs.slice(0, 12);
  const moreCount = Math.max(0, jobs.length - top.length);

  const subject = jobs.length === 0
    ? `JobScout — no new high-match jobs ${range}`
    : `JobScout — ${jobs.length} new ${jobs.length === 1 ? "match" : "matches"} ${range}`;

  // Plain-text fallback (deliverability friend).
  const text = [
    `Hi ${toName.split(" ")[0]},`,
    ``,
    jobs.length === 0
      ? `Quiet ${range} — nothing crossed your match threshold. The cron is still running every 2 hours.`
      : `${jobs.length} job${jobs.length === 1 ? "" : "s"} matched ${range}. Top picks below.`,
    ``,
    ...top.map((j, i) =>
      `${i + 1}. [${j.match_score ?? 0}] ${j.title} — ${j.company ?? "?"}\n   ${formatLine(j)}\n   Open: ${j.source_url}`
    ),
    ``,
    moreCount > 0 ? `… and ${moreCount} more in the app.` : "",
    `View the full feed: ${appUrl}/feed`,
    ``,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].filter(Boolean).join("\n");

  // HTML — single-column, dark, all inline styles for email-client compat.
  const bg = "#0a0613", panel = "#131022";
  const fg = "#f5f3ff", muted = "#8b85a8";
  const accent = "#ea580c", accent2 = "#a855f7";

  const cards = jobs.length === 0
    ? `<tr><td style="padding:24px;border:1px dashed #2d2640;border-radius:16px;text-align:center;color:${muted}">
         Nothing crossed your match threshold ${range}. Cron is still scanning every 2 hours.
       </td></tr>`
    : top.map((j) => `
      <tr><td style="padding:0 0 12px 0">
        <a href="${j.source_url}" style="display:block;padding:14px 16px;border:1px solid #2d2640;border-radius:14px;background:${panel};text-decoration:none;color:${fg}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <tr>
              <td valign="top" style="padding-right:10px">
                <div style="font-size:11px;color:${muted};text-transform:uppercase;letter-spacing:.08em">${SOURCE_LABEL[j.source] ?? j.source}</div>
                <div style="font-size:15px;font-weight:700;line-height:1.3;margin-top:2px">${escape(j.title)}</div>
                <div style="font-size:13px;color:${muted};margin-top:2px">${escape(j.company ?? "Unknown")}</div>
                <div style="font-size:12px;color:${muted};margin-top:6px">${escape(formatLine(j))}</div>
              </td>
              <td valign="top" align="right" width="56" style="padding-left:8px">
                <div style="background:linear-gradient(135deg,${accent2} 0%,${accent} 100%);color:white;border-radius:10px;padding:6px 8px;text-align:center;min-width:48px">
                  <div style="font-size:18px;font-weight:800;line-height:1">${j.match_score ?? 0}</div>
                  <div style="font-size:9px;letter-spacing:.08em;opacity:.85">MATCH</div>
                </div>
              </td>
            </tr>
          </table>
        </a>
      </td></tr>`).join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:${bg};color:${fg};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden">${escape(subject)} — ${jobs.length} jobs above your threshold</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${bg}">
    <tr><td align="center" style="padding:24px 16px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-collapse:collapse">
        <tr><td style="padding:0 4px 16px 4px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <tr>
              <td>
                <span style="display:inline-block;width:24px;height:24px;background:linear-gradient(135deg,${accent2} 0%,${accent} 100%);border-radius:8px;color:#fff;text-align:center;line-height:24px;font-size:13px;vertical-align:middle">★</span>
                <span style="font-size:18px;font-weight:800;letter-spacing:-.01em;color:${fg};vertical-align:middle;margin-left:6px">JobScout</span>
              </td>
              <td align="right" style="font-size:12px;color:${muted}">${jobs.length} match${jobs.length === 1 ? "" : "es"} ${range}</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 4px 8px 4px">
          <h1 style="margin:0;font-size:24px;line-height:1.2;font-weight:800;letter-spacing:-.01em">
            ${jobs.length === 0
              ? `Quiet ${range}.`
              : `Top ${Math.min(top.length, jobs.length)} match${top.length === 1 ? "" : "es"} ${range}.`}
          </h1>
          <p style="margin:6px 0 16px 0;color:${muted};font-size:14px">Hi ${escape(toName.split(" ")[0])} — here's what crossed your bar.</p>
        </td></tr>

        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            ${cards}
          </table>
        </td></tr>

        ${moreCount > 0 ? `<tr><td style="padding:8px 4px 0 4px;color:${muted};font-size:13px">… and ${moreCount} more in the app.</td></tr>` : ""}

        <tr><td style="padding:20px 4px 0 4px">
          <a href="${appUrl}/feed" style="display:inline-block;background:linear-gradient(135deg,${accent2} 0%,${accent} 100%);color:#fff;text-decoration:none;font-weight:600;border-radius:14px;padding:12px 20px;font-size:14px">Open the feed →</a>
        </td></tr>

        <tr><td style="padding:36px 4px 0 4px;border-top:1px solid #2d2640">
          <p style="margin:16px 0 0 0;color:${muted};font-size:11px;line-height:1.6">
            You're getting this because you opted into the JobScout digest. <a href="${unsubscribeUrl}" style="color:${muted};text-decoration:underline">Unsubscribe</a> · <a href="${appUrl}/settings" style="color:${muted};text-decoration:underline">Change frequency</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html, text };
}

function formatLine(j: DigestJob): string {
  const parts: string[] = [];
  if (j.is_remote) parts.push("Remote");
  if (j.location && !j.is_remote) parts.push(j.location);
  const sal = formatSalary(j.salary_min, j.salary_max, j.salary_period);
  if (sal) parts.push(sal);
  return parts.join(" · ");
}

function formatSalary(min: number | null, max: number | null, period: "year" | "month" | "hour"): string | null {
  if (!min && !max) return null;
  const k = (n: number) => `$${(n / 1000).toFixed(0)}k`;
  const suf = period === "year" ? "/yr" : period === "month" ? "/mo" : "/hr";
  if (min && max) return `${k(min)}–${k(max)}${suf}`;
  return `${k((max ?? min)!)}${suf}`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// ─────────────────────────────────────────────────────────────────────
// Welcome email — fired by lib/workflows.ts runOnSignup
// ─────────────────────────────────────────────────────────────────────

export function buildWelcomeEmail(args: {
  toName: string;
  appUrl: string;
  referCode?: string;
}): { subject: string; html: string; text: string } {
  const { toName, appUrl, referCode } = args;
  const firstName = toName.split(" ")[0] || "there";
  const referLink = referCode ? `${appUrl}/?ref=${referCode}` : null;

  const subject = "Welcome to JobScout — let's find your next role";

  const text = [
    `Hi ${firstName},`,
    ``,
    `Welcome to JobScout. Your account is live and the scoring engine is already scanning.`,
    ``,
    `Three things to do in the next 60 seconds:`,
    `1. Upload your resume (or paste it) — /settings or /onboarding`,
    `2. Install JobScout on your phone (Add to Home Screen) so push alerts wake you when a 90+ match posts`,
    `3. Set your salary floor + target city — everything below your bar gets filtered before you see it`,
    ``,
    referLink
      ? `★ Your refer link: ${referLink}\nWhen 2 friends sign up + stay subscribed, you lock in 20% off Pro forever.`
      : ``,
    ``,
    `Bugs, questions, ideas: hit the 🐛 or 💬 buttons in the bottom-right of any in-app page — they land directly in my queue.`,
    ``,
    `— Cory`,
    `Founder, JobScout`,
    ``,
    `${appUrl}/feed`,
  ].filter(Boolean).join("\n");

  const bg = "#0a0613", panel = "#131022";
  const fg = "#f5f3ff", muted = "#8b85a8";
  const accent = "#ea580c", accent2 = "#a855f7";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:${bg};color:${fg};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${bg}">
    <tr><td align="center" style="padding:24px 16px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-collapse:collapse">

        <tr><td style="padding:0 4px 24px 4px">
          <span style="display:inline-block;width:28px;height:28px;background:linear-gradient(135deg,${accent2} 0%,${accent} 100%);border-radius:8px;color:#fff;text-align:center;line-height:28px;font-size:16px;vertical-align:middle">★</span>
          <span style="font-size:20px;font-weight:800;letter-spacing:-.01em;color:${fg};vertical-align:middle;margin-left:8px">JobScout</span>
        </td></tr>

        <tr><td style="padding:0 4px 16px 4px">
          <h1 style="margin:0;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-.01em">Welcome to JobScout, ${escape(firstName)}.</h1>
          <p style="margin:10px 0 0 0;color:${muted};font-size:14px;line-height:1.6">Your account is live. The scoring engine is already scanning 7 boards every 2 hours. Here's how to get the most out of it in 60 seconds.</p>
        </td></tr>

        <tr><td style="padding:8px 4px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${panel};border:1px solid #2d2640;border-radius:14px">
            <tr><td style="padding:18px">
              <p style="margin:0 0 12px 0;font-size:13px;color:${accent2};text-transform:uppercase;letter-spacing:.08em;font-weight:600">3 things to do right now</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
                <tr><td valign="top" width="28" style="padding-right:10px;color:${accent};font-weight:800">1</td>
                  <td style="padding-bottom:10px;font-size:14px;line-height:1.5">
                    <strong>Upload your resume.</strong> Paste plain text or upload a PDF — <a href="${appUrl}/onboarding" style="color:${accent2}">finish onboarding →</a>
                  </td></tr>
                <tr><td valign="top" width="28" style="padding-right:10px;color:${accent};font-weight:800">2</td>
                  <td style="padding-bottom:10px;font-size:14px;line-height:1.5">
                    <strong>Install on your phone.</strong> Add to Home Screen on iPhone (Safari → Share → Add to Home Screen) or Android (menu → Install app). Push alerts wake you the second a 90+ match posts.
                  </td></tr>
                <tr><td valign="top" width="28" style="padding-right:10px;color:${accent};font-weight:800">3</td>
                  <td style="padding-bottom:0;font-size:14px;line-height:1.5">
                    <strong>Set your salary floor + target city.</strong> Everything below your bar gets filtered before you see it. <a href="${appUrl}/settings" style="color:${accent2}">/settings →</a>
                  </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        ${referLink ? `
        <tr><td style="padding:18px 4px 0 4px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${panel};border:1px solid #2d2640;border-radius:14px">
            <tr><td style="padding:16px">
              <p style="margin:0 0 6px 0;font-size:13px;color:${accent2};text-transform:uppercase;letter-spacing:.08em;font-weight:600">★ Your refer link</p>
              <p style="margin:0;font-size:14px;line-height:1.5">When 2 friends sign up with this link and stay subscribed, you lock in <strong>20% off Pro forever</strong>.</p>
              <p style="margin:10px 0 0 0;font-size:13px;background:${bg};border:1px solid #2d2640;padding:8px 10px;border-radius:8px;color:${fg};font-family:ui-monospace,Menlo,monospace;word-break:break-all">
                <a href="${referLink}" style="color:${accent2};text-decoration:none">${referLink}</a>
              </p>
            </td></tr>
          </table>
        </td></tr>` : ""}

        <tr><td style="padding:24px 4px 0 4px">
          <a href="${appUrl}/feed" style="display:inline-block;background:linear-gradient(135deg,${accent2} 0%,${accent} 100%);color:#fff;text-decoration:none;font-weight:600;border-radius:14px;padding:13px 22px;font-size:14px">Open the feed →</a>
        </td></tr>

        <tr><td style="padding:36px 4px 0 4px;border-top:1px solid #2d2640">
          <p style="margin:16px 0 0 0;color:${muted};font-size:12px;line-height:1.6">
            Bugs or feedback? Hit the 🐛 or 💬 buttons in the bottom-right of any in-app page — they land in my queue directly.
          </p>
          <p style="margin:6px 0 0 0;color:${muted};font-size:12px">— Cory · Founder, JobScout</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html, text };
}
