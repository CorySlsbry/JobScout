// KSL Jobs scraper (https://jobs.ksl.com). They expose a JSON-ish search endpoint
// that returns raw HTML in `body`; we parse the listing-card markup. No auth needed,
// but be a polite citizen — keep the request rate low (this is per-sync, not per-request).

import type { RawJob } from "../types";

const SEARCH_URL = (q: string) =>
  `https://jobs.ksl.com/search?keyword=${encodeURIComponent(q)}&category=&type=&location=`;

export async function scrapeKsl(query: string): Promise<RawJob[]> {
  if (process.env.JOBSCOUT_DISABLE_KSL === "1") return [];

  let html: string;
  try {
    const resp = await fetch(SEARCH_URL(query), {
      headers: {
        "User-Agent": "Mozilla/5.0 JobScout/1.0 (+personal)",
        Accept: "text/html,application/xhtml+xml",
      },
      next: { revalidate: 1800 },
    });
    if (!resp.ok) return [];
    html = await resp.text();
  } catch (e) {
    console.error("[ksl] fetch failed:", e);
    return [];
  }

  // KSL's HTML structure changes; this parses the most common shape.
  // Each listing is roughly:
  //   <a class="...listing..." href="/listing/12345">
  //     <div class="title">Job Title</div>
  //     <div class="company">Company</div>
  //     <div class="location">Salt Lake City, UT</div>
  //   </a>
  const out: RawJob[] = [];
  const cardRe = /<a[^>]+href="(\/listing\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(cardRe)) {
    const href = match[1];
    const id = match[2];
    const inner = match[3];
    if (out.find((o) => o.source_id === id)) continue;

    const title = clean(extract(inner, /(?:title[^>]*>)([^<]+)/i));
    if (!title) continue;
    const company = clean(extract(inner, /(?:company[^>]*>)([^<]+)/i));
    const location = clean(extract(inner, /(?:location[^>]*>)([^<]+)/i));

    out.push({
      source: "ksl",
      source_id: id,
      source_url: `https://jobs.ksl.com${href}`,
      title,
      company: company || null,
      company_url: null,
      location: location || null,
      is_remote: /remote/i.test(location ?? "") || /remote/i.test(title),
      remote_kind: /remote/i.test(location ?? "") ? "remote" : null,
      salary_min: null,
      salary_max: null,
      salary_period: "year",
      description: null,
      description_html: null,
      posted_at: null,
      raw: { href },
    });
    if (out.length >= 25) break;
  }

  return out;
}

function extract(s: string, re: RegExp): string | null {
  const m = s.match(re);
  return m ? m[1] : null;
}

function clean(s: string | null): string | null {
  if (!s) return null;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim() || null;
}
