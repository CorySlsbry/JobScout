// Turns per-user job-pull config (Profile.search_queries / search_locations /
// search_remote_only) into the ScrapeQuery[] that runAllScrapers consumes.
//
// This is the bridge between "what the user typed in Settings" and "what query
// actually gets sent to the job boards." Before this, the scrape was hardcoded
// to the founder's automation-engineer / St-George searches.

import { getDb, COL } from "./firestore";
import type { Profile } from "./types";
import type { ScrapeQuery } from "./scrapers";

const MAX_QUERIES_PER_USER = 8;
const MAX_LOCATIONS_PER_QUERY = 4;

/** Build a single user's ScrapeQuery[] from their profile. Empty when the
 *  user hasn't configured any search_queries (caller falls back to defaults). */
export function profileToScrapeQueries(p: Profile): ScrapeQuery[] {
  const queries = (p.search_queries ?? [])
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, MAX_QUERIES_PER_USER);
  if (queries.length === 0) return [];

  // Locations: when remote_only, force just "Remote". Otherwise use the
  // configured locations (falling back to "Remote" if none given).
  let locations: string[];
  if (p.search_remote_only) {
    locations = ["Remote"];
  } else {
    locations = (p.search_locations ?? [])
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, MAX_LOCATIONS_PER_QUERY);
    if (locations.length === 0) locations = ["Remote"];
  }

  return queries.map((query) => ({
    query,
    locations,
    remote: !!p.search_remote_only,
  }));
}

/** Union every user's scrape config into one deduped list. Deduped by
 *  (query|location) pair so two users searching the same thing only cost
 *  one API call. runAllScrapers caps the total further. */
export async function collectAllUserScrapeQueries(): Promise<ScrapeQuery[]> {
  const db = getDb();
  if (!db) return [];
  let profiles: Profile[];
  try {
    const snap = await db.collection(COL.profile).get();
    profiles = snap.docs.map((d) => d.data() as Profile);
  } catch {
    return [];
  }

  // Collect into a map keyed by lowercased query → set of locations, so we
  // merge locations across users who share a query term.
  const byQuery = new Map<string, { query: string; locations: Set<string>; remote: boolean }>();
  for (const p of profiles) {
    for (const sq of profileToScrapeQueries(p)) {
      const key = sq.query.toLowerCase();
      const existing = byQuery.get(key);
      if (existing) {
        sq.locations.forEach((l) => existing.locations.add(l));
        existing.remote = existing.remote || sq.remote;
      } else {
        byQuery.set(key, { query: sq.query, locations: new Set(sq.locations), remote: sq.remote });
      }
    }
  }

  return Array.from(byQuery.values()).map((v) => ({
    query: v.query,
    locations: Array.from(v.locations).slice(0, MAX_LOCATIONS_PER_QUERY),
    remote: v.remote,
  }));
}
