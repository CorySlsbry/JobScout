// Cron endpoint — call this from Vercel Cron, n8n, or any scheduler.
// Protect with `?token=$CRON_TOKEN` (matches process.env.CRON_TOKEN).
//
// The cron has no user session; it runs as the "owner" of the shared job
// pool — i.e. the admin user — whose profile drives the scoring pass.

import { NextResponse } from "next/server";
import { runAllScrapers, type ExtraPortal } from "@/lib/scrapers";
import { upsertRawJobs, getProfile } from "@/lib/db";
import { getAdminUid } from "@/lib/users";
import { getDb, COL } from "@/lib/firestore";
import { collectAllUserScrapeQueries } from "@/lib/job-search-config";
import type { Profile } from "@/lib/types";
import webpush from "web-push";
import { shouldNotify } from "@/lib/matching";
import { fanOutAlert, buildAlertPayload, isWithinQuietHours } from "@/lib/alert-fanout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!process.env.CRON_TOKEN || token !== process.env.CRON_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminUid = await getAdminUid();
  if (!adminUid) {
    return NextResponse.json({
      error: "no_admin_user",
      help: "No user with role=admin found. Cron needs an admin profile to score against. Sign in once as the admin to provision.",
    }, { status: 503 });
  }

  const profile = await getProfile(adminUid);

  // Aggregate every user's custom_sources into a deduped extra-portal list.
  // Lets users seed the shared job pool with their favorite Greenhouse/
  // Ashby/Lever orgs (e.g. Anthropic, Vellum, Decagon).
  const extras = await collectUserCustomSources();
  // Union every user's search-query config (terms + locations) so the scrape
  // actually pulls what users asked for. Empty → runAllScrapers uses defaults.
  const userQueries = await collectAllUserScrapeQueries();
  const raws = await runAllScrapers(extras, userQueries);
  const { inserted, updated } = await upsertRawJobs(profile, raws);

  // Push notify on new high-match jobs.
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  let pushed = 0;
  if (pub && priv) {
    webpush.setVapidDetails(process.env.VAPID_CONTACT_EMAIL ?? "mailto:cory.salisbury@gmail.com", pub, priv);
    if (profile.push_subscription) {
      const notable = raws.filter((r) => {
        const isStG = (r.location ?? "").toLowerCase().includes("george");
        const annual = annualize(r.salary_max ?? r.salary_min ?? 0, r.salary_period);
        return shouldNotify(60, annual >= profile.salary_floor, isStG);
      });
      if (notable.length && !isWithinQuietHours(profile)) {
        await webpush.sendNotification(
          profile.push_subscription as unknown as webpush.PushSubscription,
          JSON.stringify({
            title: `${notable.length} new high-match job${notable.length === 1 ? "" : "s"}`,
            body: notable.slice(0, 2).map((j) => `${j.title} — ${j.company ?? "?"}`).join("\n"),
            icon: "/icon-192.png",
            url: "/",
          })
        );
        pushed = notable.length;
      }
    }
  }

  // Fan out to Slack / Discord webhooks if the user has configured them.
  // Skipped during quiet hours by the helper.
  let fannedOutTo: string[] = [];
  try {
    const notable = (await runAllScrapers.length) ? raws.filter((r) => {
      const isStG = (r.location ?? "").toLowerCase().includes("george");
      const annual = annualize(r.salary_max ?? r.salary_min ?? 0, r.salary_period);
      return shouldNotify(75, annual >= profile.salary_floor, isStG);
    }) : [];
    if (notable.length && (profile.slack_webhook_url || profile.discord_webhook_url)) {
      fannedOutTo = await fanOutAlert(profile, buildAlertPayload(notable));
    }
  } catch {/* never let alert fan-out break the cron */}

  return NextResponse.json({ ok: true, scanned: raws.length, inserted, updated, pushed, fanned_out_to: fannedOutTo });
}

function annualize(amount: number, period: "year" | "month" | "hour"): number {
  if (period === "year") return amount;
  if (period === "month") return amount * 12;
  return amount * 2080;
}

// Pulls every user's custom_sources, normalizes shape, returns a deduped list.
async function collectUserCustomSources(): Promise<ExtraPortal[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const snap = await db.collection(COL.profile).get();
    const all: ExtraPortal[] = [];
    for (const d of snap.docs) {
      const p = d.data() as Profile;
      const sources = p.custom_sources;
      if (!Array.isArray(sources)) continue;
      for (const s of sources) {
        if (!s || typeof s.slug !== "string" || !s.slug.trim()) continue;
        if (s.kind !== "greenhouse" && s.kind !== "ashby" && s.kind !== "lever") continue;
        all.push({ kind: s.kind, slug: s.slug.trim().toLowerCase() });
      }
    }
    return all;
  } catch {
    return [];
  }
}
