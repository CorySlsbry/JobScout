// Email-digest cron endpoint. Sends a single email per active profile
// with new high-match jobs since the last send. Triggered by Cloud Scheduler.
// Protect with ?token=$CRON_TOKEN.
//
// v1 sends only to the admin profile. Multi-tenant fan-out happens in a
// later phase — once we have multiple paying users, iterate over all
// profiles with digest_frequency != "off".

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { listJobs, getProfile, updateProfile } from "@/lib/db";
import { getAdminUid } from "@/lib/users";
import { getMailer, FROM_DEFAULT, buildDigestEmail, type DigestJob } from "@/lib/email";
import { publicAppUrl } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!process.env.CRON_TOKEN || token !== process.env.CRON_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const mailer = getMailer();
  if (!mailer) {
    return NextResponse.json({
      ok: false,
      skipped: "SMTP not configured — set SMTP_HOST/SMTP_USER/SMTP_PASS env vars (see /settings for setup).",
    });
  }

  const adminUid = await getAdminUid();
  if (!adminUid) {
    return NextResponse.json({ error: "no_admin_user" }, { status: 503 });
  }

  const profile = await getProfile(adminUid);
  if (profile.digest_frequency === "off") {
    return NextResponse.json({ ok: true, skipped: "digest_off" });
  }

  // Throttle: don't send daily more than once/24h or weekly more than once/7d.
  const now = Date.now();
  const last = profile.digest_last_sent_at ? new Date(profile.digest_last_sent_at).getTime() : 0;
  const minGap = profile.digest_frequency === "weekly" ? 6.5 * 24 * 3600 * 1000 : 22 * 3600 * 1000;
  if (last && now - last < minGap) {
    return NextResponse.json({ ok: true, skipped: "too_soon", last_sent_at: profile.digest_last_sent_at });
  }

  // Gather jobs above the user's match threshold, discovered since last send.
  const minScore = profile.digest_min_score ?? 70;
  const all = await listJobs(adminUid, { minScore });
  const sinceCutoff = last ? new Date(last).toISOString() : new Date(now - 24 * 3600 * 1000).toISOString();
  const fresh = all.filter((j) => (j.discovered_at ?? "") >= sinceCutoff);

  // For weekly cadence: include all current high-matches; otherwise just fresh ones.
  const jobs: DigestJob[] = (profile.digest_frequency === "weekly" ? all : fresh).map((j) => ({
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    is_remote: j.is_remote,
    salary_min: j.salary_min,
    salary_max: j.salary_max,
    salary_period: j.salary_period,
    match_score: j.match_score,
    source: j.source,
    source_url: j.source_url,
  }));

  // Empty digest: only send if weekly (so user knows the system is running).
  if (jobs.length === 0 && profile.digest_frequency !== "weekly") {
    await updateProfile(adminUid, { digest_last_sent_at: new Date().toISOString() });
    return NextResponse.json({ ok: true, skipped: "no_fresh_jobs" });
  }

  // One-shot unsubscribe token (rotated per send for safety).
  const unsubToken = randomBytes(24).toString("hex");
  const appUrl = publicAppUrl(req);
  const unsubscribeUrl = `${appUrl}/api/digest/unsubscribe?token=${unsubToken}`;

  const { subject, html, text } = buildDigestEmail({
    toName: profile.full_name,
    jobs,
    appUrl,
    unsubscribeUrl,
    range: profile.digest_frequency === "weekly" ? "this week" : "today",
  });

  try {
    await mailer.sendMail({
      from: FROM_DEFAULT,
      to: profile.email,
      subject,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "send_failed" }, { status: 502 });
  }

  await updateProfile(adminUid, {
    digest_last_sent_at: new Date().toISOString(),
    digest_unsubscribe_token: unsubToken,
  });

  return NextResponse.json({ ok: true, sent_to: profile.email, jobs: jobs.length });
}
