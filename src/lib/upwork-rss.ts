// Upwork RSS feed reader.
//
// Upwork exposes RSS for any search query OR saved search (per-user). Users
// paste their RSS URL(s) in /settings → Upwork sources, and the cron polls
// each one hourly, scores new jobs, drafts proposals, and stores as
// UpworkLead docs. Works for any Pro+ user — no Gmail OAuth required.
//
// We parse RSS with a minimal regex-based parser to avoid pulling in a
// full XML library. Upwork's RSS format is consistent enough that this
// holds up — and if Upwork breaks the format, we fail-soft to an empty
// list, log the error, and the rest of the cron continues.

export type UpworkRssItem = {
  source_id: string;        // Upwork job ID parsed from the link (~0abc123…)
  job_url: string;          // canonical https://www.upwork.com/jobs/~01...
  title: string;
  description: string;      // raw HTML/text from <description>
  budget_text: string | null;     // "Hourly: $50-$100" or "Fixed: $500" — best-effort
  posted_at: string | null; // ISO timestamp
  raw_pub_date: string | null;
};

const JOB_ID_RE = /(~01[0-9a-f]{16}|~0[0-9a-f]{17})/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function stripCdata(s: string): string {
  const m = s.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return m ? m[1] : s;
}

function extractTag(item: string, tag: string): string | null {
  // Match <tag>...</tag> non-greedy, allow CDATA inside
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = item.match(re);
  if (!m) return null;
  return stripCdata(m[1]).trim();
}

function parseBudget(descHtml: string): string | null {
  // Upwork RSS descriptions include lines like:
  //   "Hourly Range: $50.00-$100.00"  /  "Budget: $500"  /  "Hourly Range: Not Sure"
  const m = descHtml.match(/(Hourly(?:\s+Range)?|Budget|Fixed[- ]Price)\s*:?\s*([^<\n]{1,80})/i);
  if (!m) return null;
  const label = m[1].replace(/\s+/g, " ").trim();
  const value = m[2].replace(/<[^>]+>/g, "").trim();
  return `${label}: ${value}`.slice(0, 120);
}

export function parseUpworkRss(xml: string): UpworkRssItem[] {
  if (!xml || typeof xml !== "string") return [];
  const items: UpworkRssItem[] = [];
  // Crude <item>...</item> split. Works on Upwork's stable feed format.
  const ITEM_RE = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = ITEM_RE.exec(xml)) !== null) {
    const body = match[1];
    const title = decodeEntities(extractTag(body, "title") ?? "").slice(0, 300);
    const link = decodeEntities(extractTag(body, "link") ?? "").trim();
    const desc = decodeEntities(extractTag(body, "description") ?? "");
    const pubDate = extractTag(body, "pubDate");

    if (!title || !link) continue;
    const idMatch = link.match(JOB_ID_RE);
    if (!idMatch) continue;     // skip non-job items (RSS may include sponsored slots)

    const posted_at = pubDate ? new Date(pubDate).toISOString() : null;
    items.push({
      source_id: idMatch[1],
      job_url: link.split("?")[0],   // strip Upwork tracking params for stable doc ids
      title,
      description: desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 6000),
      budget_text: parseBudget(desc),
      posted_at,
      raw_pub_date: pubDate,
    });
  }
  return items;
}

/** Fetch + parse one Upwork RSS URL. Returns [] on any error — never throws. */
export async function fetchUpworkRss(url: string): Promise<UpworkRssItem[]> {
  // SSRF guard. Three layers:
  //   1. https only.
  //   2. EXACT host match — "upwork.com" or "*.upwork.com" (the old
  //      endsWith("upwork.com") also matched "evilupwork.com").
  //   3. redirect:"manual" — a 3xx (even from a real upwork.com open-redirect)
  //      is treated as a miss, so the fetch can't be bounced to 169.254.169.254
  //      or an internal address.
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return [];
  }
  if (u.protocol !== "https:") return [];
  const host = u.hostname.toLowerCase();
  if (host !== "upwork.com" && !host.endsWith(".upwork.com")) return [];

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(u.toString(), {
      headers: {
        "user-agent": "JobScoutRSSReader/1.0 (+https://jobscout-hq.com)",
        "accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: ctrl.signal,
      redirect: "manual",   // do NOT follow redirects — SSRF bounce protection
    });
    // A redirect (status 0 in 'manual' mode shows as type 'opaqueredirect') or
    // any non-2xx → treat as a miss rather than chasing it.
    if (res.type === "opaqueredirect" || !res.ok) return [];
    const xml = await res.text();
    return parseUpworkRss(xml);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
