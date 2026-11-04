// GET /api/cron/upwork-rss?token=$CRON_TOKEN
//
// Polls every Pro+ user's upwork_search_urls, parses the RSS, deduplicates
// against existing UpworkLead docs by source_id, scores new jobs via Claude,
// and stores results. Designed to be safe to fire hourly — idempotent + cheap.
//
// Per-user cap: 50 new leads per run (defensive cost cap).
// Global cap: 30s wall-clock per user (we move on if a user's feed is slow).

import { NextResponse } from "next/server";
import { getDb, COL } from "@/lib/firestore";
import { fetchUpworkRss, type UpworkRssItem } from "@/lib/upwork-rss";
import { fetchUpworkJobsForQueries } from "@/lib/apify-upwork";
import { existingLeadIds, leadIdFromJobId, upsertLead } from "@/lib/leads";
import { getProfile, updateProfile } from "@/lib/db";
import { captureError } from "@/lib/error-monitoring";
import type { User, UpworkLead, Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_NEW_PER_USER = 50;
// Throttle the PAID Apify scrape to ~4×/day per user even though the cron is
// hourly — keeps cost predictable. RSS (free, mostly dead) still runs hourly.
const APIFY_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Stop STARTING new Apify pulls past this point in a run so a cold start where
// every user is due can't blow the 300s cron limit; the rest catch up next hour.
const APIFY_WALLCLOCK_BUDGET_MS = 240_000;

type Candidate = { item: UpworkRssItem; kind: "rss" | "apify"; search: string };

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_TOKEN || url.searchParams.get("token") !== process.env.CRON_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getDb();
  if (!db) return NextResponse.json({ error: "firestore_not_configured" }, { status: 503 });

  const startedAt = Date.now();
  const summary: Array<{ uid: string; sources: number; queries: number; apify_ran: boolean; fetched: number; new_leads: number; error: string | null }> = [];

  // Pull all Pro+ users — anyone with subscription_status=active|trialing OR role=admin.
  const usersSnap = await db.collection(COL.users).get();
  const eligible: User[] = usersSnap.docs
    .map((d) => d.data() as User)
    .filter((u) => u.role === "admin" || ((u.subscription_status === "active" || u.subscription_status === "trialing") && (u.plan === "pro" || u.plan === "boost")));

  for (const user of eligible) {
    const userStart = Date.now();
    const row: typeof summary[number] = { uid: user.id, sources: 0, queries: 0, apify_ran: false, fetched: 0, new_leads: 0, error: null };
    try {
      const profile = await getProfile(user.id);
      const urls = (profile.upwork_search_urls ?? []).filter(Boolean);
      const queries = (profile.upwork_search_queries ?? []).filter(Boolean);
      row.sources = urls.length;
      row.queries = queries.length;
      const profilePatch: Partial<Profile> = {};

      // ── 1. Legacy RSS (token'd saved-search feeds still resolve; the public
      //    keyword RSS endpoints now 410 Gone → fetchUpworkRss fails soft to []).
      const rssItems: Candidate[] = urls.length
        ? (await Promise.all(urls.map(fetchUpworkRss))).flat().map((i) => ({ item: i, kind: "rss", search: "rss" }))
        : [];

      // ── 2. Apify keyword scrape — the LIVE mechanism. Throttled per-user
      //    (~4×/day) and globally wall-clock-budgeted so the paid scrape stays
      //    cheap and a cold run can't exceed the cron's 300s limit.
      const apifyToken = process.env.APIFY_TOKEN;
      const lastApify = profile.upwork_apify_last_run ? Date.parse(profile.upwork_apify_last_run) : 0;
      const apifyDue = Date.now() - (Number.isFinite(lastApify) ? lastApify : 0) > APIFY_MIN_INTERVAL_MS;
      const apifyBudgetLeft = Date.now() - startedAt < APIFY_WALLCLOCK_BUDGET_MS;
      let apifyItems: Candidate[] = [];
      if (apifyToken && queries.length > 0 && apifyDue && apifyBudgetLeft) {
        const got = await fetchUpworkJobsForQueries(queries, apifyToken, { maxQueries: 4, maxJobsPerQuery: 20 });
        apifyItems = got.map((g) => ({ item: g, kind: "apify", search: g.source_search }));
        row.apify_ran = true;
        profilePatch.upwork_apify_last_run = new Date().toISOString();
      }

      const all: Candidate[] = [...rssItems, ...apifyItems];
      row.fetched = all.length;
      if (all.length === 0) {
        if (Object.keys(profilePatch).length) await updateProfile(user.id, profilePatch);
        summary.push(row);
        continue;
      }

      // Dedupe against existing leads for this user AND within this batch
      // (a job can surface from multiple keywords or both RSS + Apify).
      const candidateIds = all.map((a) => leadIdFromJobId(a.item.source_id));
      const existing = await existingLeadIds(user.id, candidateIds);
      const seenBatch = new Set<string>();
      const fresh = all.filter((a) => {
        const id = leadIdFromJobId(a.item.source_id);
        if (existing.has(id) || seenBatch.has(id)) return false;
        seenBatch.add(id);
        return true;
      }).slice(0, MAX_NEW_PER_USER);

      // Store as UpworkLead docs (status:new, score:0). Scoring runs through the
      // existing Claude pipeline on first view — keeps the cron fast + cheap.
      const now = new Date().toISOString();
      for (const { item, kind, search } of fresh) {
        const lead: UpworkLead = {
          id: leadIdFromJobId(item.source_id),
          user_id: user.id,
          job_url: item.job_url,
          title: item.title,
          budget_text: item.budget_text,
          source_kind: kind,
          source_id: item.source_id,
          source_search: search,
          description: item.description,
          posted_at: item.posted_at,
          discovered_at: now,
          status: "new",
          score: 0,
          verdict: "undecided",
          reasons: [kind === "apify"
            ? `Pulled from Upwork keyword search "${search}" — score pending on first view`
            : "Pulled from RSS — score pending on first view"],
          dimensions: [],
          filter_violations: [],
          suggested_bid: null,
          suggested_bid_kind: null,
          draft_cover_letter: null,
          draft_answers: null,
          updated_at: now,
        };
        await upsertLead(lead);
        row.new_leads++;
        if (Date.now() - userStart > 30_000) break;  // per-user wall-clock cap
      }

      if (urls.length) profilePatch.upwork_rss_last_run = new Date().toISOString();
      if (Object.keys(profilePatch).length) await updateProfile(user.id, profilePatch);
    } catch (e) {
      row.error = e instanceof Error ? e.message.slice(0, 200) : "unknown";
      void captureError(e, { source: "server", path: "/api/cron/upwork-rss", integration: "upwork-rss", user_id: user.id });
    }
    summary.push(row);
  }

  return NextResponse.json({
    ok: true,
    eligible: eligible.length,
    elapsed_ms: Date.now() - startedAt,
    summary,
    totals: {
      sources: summary.reduce((a, b) => a + b.sources, 0),
      fetched: summary.reduce((a, b) => a + b.fetched, 0),
      new_leads: summary.reduce((a, b) => a + b.new_leads, 0),
    },
  });
}
