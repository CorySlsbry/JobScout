// Upwork job ingestion via Apify — the live mechanism since Upwork retired
// public RSS (the /ab/feed/jobs/rss endpoints now return 410 Gone, verified
// 2026-06-03). Users type plain keywords in /settings → upwork_search_queries;
// the cron runs each keyword through an Apify Upwork scraper and normalizes the
// result into the SAME UpworkRssItem shape the rest of the pipeline already
// consumes (dedupe → store → score), so nothing downstream changes.
//
// Actor: gio21/upwork-jobs-scraper — chosen over neatrat/upwork-job-scraper
// because neatrat returned 0 items in live testing (blocked) while gio21
// returned clean, on-target jobs at 99.8% success and a lower price
// ($0.0015/job vs $0.0035). Input is just { query, max_jobs }.
//
// Server-side only. Cloud Run is headless, so we call Apify's REST API with
// APIFY_TOKEN — NOT the Claude-side MCP. If APIFY_TOKEN is unset the functions
// no-op to [] so deploys are safe before the secret is provisioned.

import type { UpworkRssItem } from "./upwork-rss";

const APIFY_ACTOR = "gio21~upwork-jobs-scraper"; // REST uses ~ instead of /
const RUN_SYNC_URL = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items`;

// Raw shape returned by gio21/upwork-jobs-scraper (captured from a real run).
type ApifyUpworkJob = {
  jobId?: string;
  title?: string;
  description?: string;
  contractType?: string;   // "Hourly: $50.00 - $200.00" | "Hourly" | "Fixed price"
  budget?: string;         // "$50.00 - $200.00" | ""
  experienceLevel?: string;
  duration?: string;
  postedOn?: string;       // relative: "Posted 2 hours ago" | "Posted yesterday"
  skills?: string[];
  extraSkills?: number;
  clientVerified?: boolean;
  clientCountry?: string;
  url?: string;            // https://www.upwork.com/jobs/~022062...
};

const JOB_ID_FROM_URL = /\/jobs\/(~[0-9a-z]+)/i;

/** Best-effort relative-time → ISO. "Posted 2 hours ago" → ~2h before now. */
export function relativePostedToIso(postedOn: string | undefined | null, now: number = Date.now()): string | null {
  if (!postedOn) return null;
  const s = postedOn.toLowerCase();
  if (/just now|moments? ago/.test(s)) return new Date(now).toISOString();
  if (/yesterday/.test(s)) return new Date(now - 24 * 3600_000).toISOString();
  const m = s.match(/(\d+)\s*(minute|hour|day|week|month)s?\s*ago/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unitMs: Record<string, number> = {
      minute: 60_000, hour: 3600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000,
    };
    const ms = unitMs[m[2]] ?? 0;
    if (ms && Number.isFinite(n)) return new Date(now - n * ms).toISOString();
  }
  if (/last week/.test(s)) return new Date(now - 604_800_000).toISOString();
  return null; // unknown format → leave null rather than fabricate
}

/** Fold the structured extras gio21 gives (that RSS never did) into the
 *  description text so the Claude scorer/drafter sees experience, duration,
 *  skills, and client trust signal without a schema change downstream. */
function enrichDescription(job: ApifyUpworkJob): string {
  const base = (job.description ?? "").replace(/\s+/g, " ").trim();
  const meta: string[] = [];
  if (job.experienceLevel) meta.push(`Experience: ${job.experienceLevel}`);
  if (job.duration) meta.push(`Duration: ${job.duration}`);
  if (job.skills && job.skills.length) {
    const extra = job.extraSkills && job.extraSkills > 0 ? ` (+${job.extraSkills} more)` : "";
    meta.push(`Skills: ${job.skills.slice(0, 12).join(", ")}${extra}`);
  }
  if (typeof job.clientVerified === "boolean") meta.push(`Client payment verified: ${job.clientVerified ? "yes" : "no"}`);
  if (job.clientCountry) meta.push(`Client country: ${job.clientCountry}`);
  const metaLine = meta.length ? `\n\n— ${meta.join(" · ")}` : "";
  return (base + metaLine).slice(0, 6000);
}

export function normalizeApifyJob(job: ApifyUpworkJob): UpworkRssItem | null {
  const url = (job.url ?? "").trim();
  const idFromUrl = url.match(JOB_ID_FROM_URL)?.[1];
  // Prefer the ~-prefixed id from the URL (matches the canonical Upwork job id
  // and the email/RSS source_ids); fall back to the bare jobId field.
  const source_id = idFromUrl ?? (job.jobId ? `~${job.jobId.replace(/^~/, "")}` : null);
  const title = (job.title ?? "").trim().slice(0, 300);
  if (!source_id || !title) return null;

  const budget_text =
    (job.contractType && job.contractType.trim()) ||
    (job.budget && job.budget.trim()) ||
    null;

  return {
    source_id,
    job_url: (url || `https://www.upwork.com/jobs/${source_id}`).split("?")[0],
    title,
    description: enrichDescription(job),
    budget_text,
    posted_at: relativePostedToIso(job.postedOn),
    raw_pub_date: job.postedOn ?? null,
  };
}

/**
 * Run ONE keyword query through the Apify Upwork scraper. Returns normalized
 * items; never throws (fail-soft to [] on missing token, actor error, timeout,
 * or bad payload) so one bad query can't break the cron.
 *
 * @param query    plain keywords, e.g. "ai automation consultant"
 * @param token    APIFY_TOKEN (Apify personal API token); if falsy → []
 * @param maxJobs  hard cap on jobs returned (cost guard). Default 20.
 */
export async function fetchUpworkJobsViaApify(
  query: string,
  token: string | undefined,
  maxJobs = 20,
): Promise<UpworkRssItem[]> {
  const q = (query ?? "").trim();
  if (!q || !token) return [];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const endpoint = `${RUN_SYNC_URL}?token=${encodeURIComponent(token)}&maxItems=${maxJobs}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: q, max_jobs: maxJobs }),
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    const items: UpworkRssItem[] = [];
    const seen = new Set<string>();
    for (const raw of data as ApifyUpworkJob[]) {
      const item = normalizeApifyJob(raw);
      if (item && !seen.has(item.source_id)) {
        seen.add(item.source_id);
        items.push(item);
      }
    }
    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Run several keyword queries, capping total queries (cost guard). Tags each
 *  item's originating query so the cron can store it as the lead's source_search. */
export async function fetchUpworkJobsForQueries(
  queries: string[],
  token: string | undefined,
  opts: { maxQueries?: number; maxJobsPerQuery?: number } = {},
): Promise<Array<UpworkRssItem & { source_search: string }>> {
  const maxQueries = opts.maxQueries ?? 4;
  const maxJobsPerQuery = opts.maxJobsPerQuery ?? 20;
  const clean = Array.from(new Set(queries.map((s) => s.trim()).filter(Boolean))).slice(0, maxQueries);
  if (clean.length === 0 || !token) return [];

  const perQuery = await Promise.all(
    clean.map(async (q) => {
      const items = await fetchUpworkJobsViaApify(q, token, maxJobsPerQuery);
      return items.map((i) => ({ ...i, source_search: q }));
    }),
  );
  // Flatten + dedupe across queries by source_id (first query wins its label).
  const seen = new Set<string>();
  const out: Array<UpworkRssItem & { source_search: string }> = [];
  for (const item of perQuery.flat()) {
    if (seen.has(item.source_id)) continue;
    seen.add(item.source_id);
    out.push(item);
  }
  return out;
}
