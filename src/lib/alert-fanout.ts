// High-match alert fan-out — Slack + Discord webhook senders.
//
// Called from the push-notification path (actions.ts syncJobsAction + the
// /api/cron/sync route) AFTER a 90+ match is detected. Both Slack and
// Discord accept simple POST { text/content, … } payloads on their incoming
// webhooks. Quiet-hours filtering and rate-limiting live in the caller.

import type { Profile, RawJob } from "./types";

export type AlertPayload = {
  title: string;
  body: string;
  url: string;
};

/** True iff the current UTC hour falls in [start, end] of the user's quiet-hours range. */
export function isWithinQuietHours(profile: Profile, now = new Date()): boolean {
  const s = profile.quiet_hours_start;
  const e = profile.quiet_hours_end;
  if (typeof s !== "number" || typeof e !== "number") return false;
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
  const hr = now.getUTCHours();
  // Range may wrap past midnight: 22 → 7
  if (s <= e) return hr >= s && hr < e;
  return hr >= s || hr < e;
}

export function buildAlertPayload(jobs: RawJob[]): AlertPayload {
  const n = jobs.length;
  const head = jobs.slice(0, 5).map((j) => `• ${j.title}${j.company ? ` — ${j.company}` : ""}${j.location ? ` (${j.location})` : ""}`).join("\n");
  const more = n > 5 ? `\n… and ${n - 5} more` : "";
  return {
    title: `${n} new high-match job${n === 1 ? "" : "s"} on JobScout`,
    body: `${head}${more}`,
    url: "https://jobscout-hq.com/feed",
  };
}

async function postJson(url: string, payload: Record<string, unknown>): Promise<void> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 6000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch {/* never throw — alerts are fire-and-forget */}
  finally {
    clearTimeout(timeout);
  }
}

// SSRF guard: only POST to the official webhook hosts. Without this, a user
// could set their webhook to http://169.254.169.254/… (GCP metadata) or an
// internal address and the server would dutifully POST to it on every
// high-match alert. Exact-host allowlist + https-only is the mitigation.
function isAllowedWebhook(raw: string, allowedHosts: string[]): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return allowedHosts.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

const SLACK_HOSTS = ["hooks.slack.com"];
const DISCORD_HOSTS = ["discord.com", "discordapp.com"];

/** Fan-out an alert to whichever webhooks the user has configured. Returns the channels that were attempted. */
export async function fanOutAlert(profile: Profile, alert: AlertPayload): Promise<string[]> {
  if (isWithinQuietHours(profile)) return [];
  const channels: string[] = [];
  const slack = profile.slack_webhook_url?.trim();
  const discord = profile.discord_webhook_url?.trim();
  const ops: Promise<void>[] = [];
  if (slack && isAllowedWebhook(slack, SLACK_HOSTS)) {
    // Slack accepts { text }. Use mrkdwn for the body, plain for the title.
    ops.push(postJson(slack, {
      text: `*${alert.title}*\n${alert.body}\n<${alert.url}|Open JobScout →>`,
    }));
    channels.push("slack");
  }
  if (discord && isAllowedWebhook(discord, DISCORD_HOSTS)) {
    // Discord webhook accepts { content }. Markdown link in <> brackets is auto-linked.
    ops.push(postJson(discord, {
      content: `**${alert.title}**\n${alert.body}\n${alert.url}`,
    }));
    channels.push("discord");
  }
  await Promise.allSettled(ops);
  return channels;
}
