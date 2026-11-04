// Scraper orchestrator. Each individual scraper returns a list of RawJob.
// Real APIs require keys — when missing, scrapers return [] (or mock data
// in dev). The KSL scraper is plain HTML and works without keys.

import type { RawJob } from "../types";
import { searchJSearch } from "./jsearch";
import { scrapeKsl } from "./ksl";
import { mockSearch } from "./mock";
import { PORTALS } from "./portals";
import { scrapeGreenhouse } from "./greenhouse";
import { scrapeAshby } from "./ashby";
import { scrapeLever } from "./lever";

// Title keywords used to filter the portal scrapes. Each portal returns
// the company's FULL job list; we only keep roles that match Cory's
// interests so the feed doesn't drown in unrelated postings.
const PORTAL_MATCH_TERMS = [
  "engineer", "developer", "automation", "integration", "workflow",
  "solutions architect", "forward deployed", "applied ai",
  "platform", "full stack", "backend", "frontend",
  "ai engineer", "ml engineer", "agent", "llm",
  "devrel", "developer advocate",
];

export type ScrapeQuery = {
  query: string;
  locations: string[];
  remote: boolean;
};

const DEFAULT_QUERIES: ScrapeQuery[] = [
  { query: "automation engineer",   locations: ["Remote", "Saint George, UT", "Salt Lake City, UT"], remote: true },
  { query: "solutions architect",   locations: ["Remote", "Saint George, UT"],                       remote: true },
  { query: "integration engineer",  locations: ["Remote", "Saint George, UT", "Lehi, UT"],          remote: true },
  { query: "workflow engineer",     locations: ["Remote"],                                          remote: true },
  { query: "forward deployed",      locations: ["Remote"],                                          remote: true },
];

export type ExtraPortal = { kind: 'greenhouse' | 'ashby' | 'lever'; slug: string };

// Hard cap on the number of (query × location) JSearch calls per run, so a
// large user base unioning their configs can't blow the RapidAPI quota.
const MAX_QUERY_LOCATION_PAIRS = 40;

export async function runAllScrapers(
  extras: ExtraPortal[] = [],
  queries?: ScrapeQuery[],
): Promise<RawJob[]> {
  // queries undefined/empty → platform defaults, so the pool is never empty.
  const activeQueries = (queries && queries.length > 0) ? queries : DEFAULT_QUERIES;
  // Dedupe extras against the built-in PORTALS list AND against themselves.
  const builtInKeys = new Set(PORTALS.map((p) => `${p.kind}::${p.slug.toLowerCase()}`));
  const seenExtra = new Set<string>();
  const uniqueExtras = extras.filter((e) => {
    if (!e.slug) return false;
    const k = `${e.kind}::${e.slug.toLowerCase()}`;
    if (builtInKeys.has(k) || seenExtra.has(k)) return false;
    seenExtra.add(k);
    return true;
  });

  const portalScrapes = [...PORTALS, ...uniqueExtras].map((p) => {
    switch (p.kind) {
      case "greenhouse": return scrapeGreenhouse(p.slug, { matchTerms: PORTAL_MATCH_TERMS });
      case "ashby":      return scrapeAshby(p.slug,      { matchTerms: PORTAL_MATCH_TERMS });
      case "lever":      return scrapeLever(p.slug,      { matchTerms: PORTAL_MATCH_TERMS });
    }
  });

  // Flatten query × location into individual JSearch calls, capped.
  const jsearchCalls = activeQueries
    .flatMap((q) => q.locations.map((loc) => ({ query: q.query, loc })))
    .slice(0, MAX_QUERY_LOCATION_PAIRS)
    .map(({ query, loc }) => searchJSearch(query, loc));

  // KSL (Utah-local HTML scrape) only runs when the active query set looks
  // Utah-relevant — i.e. someone is searching a Utah location. Otherwise it's
  // pure noise for the rest of the user base.
  const wantsUtah = activeQueries.some((q) =>
    q.locations.some((l) => /\b(ut|utah|george|salt lake|provo|orem|lehi|ogden)\b/i.test(l)),
  );
  const kslCalls = wantsUtah
    ? [scrapeKsl("automation"), scrapeKsl("integration engineer"), scrapeKsl("workflow")]
    : [];

  const results = await Promise.allSettled([
    ...jsearchCalls,
    ...portalScrapes,
    ...kslCalls,
    process.env.JOBSCOUT_USE_MOCKS === "1" ? mockSearch() : Promise.resolve([] as RawJob[]),
  ]);

  const all: RawJob[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
    else console.error("[scrape] failed:", r.reason);
  }

  // Dedupe by (source, source_id).
  const seen = new Set<string>();
  return all.filter((j) => {
    const k = `${j.source}::${j.source_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
