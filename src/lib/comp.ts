// Comp Intelligence — Firestore-cached, AI-researched salary benchmarks.
//
// Architecture: read-through cache. /api/comp/lookup is the single entry
// point; it normalizes the query, hits the cache, returns a fresh hit OR
// runs a Claude-with-websearch research pass on miss/stale, stores the
// result, returns it. Soft TTL = 7 days.

import { getDb, COL } from "./firestore";
import type { CompBenchmark } from "./types";

const TTL_DAYS = 7;

export function compCacheKey(input: { company: string; role: string; level?: string | null; geography?: string | null }): string {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return [norm(input.company), norm(input.role), norm(input.level), norm(input.geography)]
    .map((s) => s || "_")
    .join("::");
}

export function newCompId(): string {
  return "comp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export async function getCachedComp(cacheKey: string): Promise<CompBenchmark | null> {
  const db = getDb();
  if (!db) return null;
  // Single-field where + in-memory newest-pick — avoids a composite
  // (cache_key, researched_at) index that isn't auto-provisioned and would
  // throw FAILED_PRECONDITION mid-request. Matches per key are tiny.
  const snap = await db.collection(COL.compBenchmarks).where("cache_key", "==", cacheKey).limit(25).get();
  if (snap.empty) return null;
  const docs = snap.docs.map((d) => d.data() as CompBenchmark);
  docs.sort((a, b) => (b.researched_at ?? "").localeCompare(a.researched_at ?? ""));
  // Soft TTL — return the newest (even if stale); callers decide to refresh.
  return docs[0];
}

export function isFresh(b: CompBenchmark): boolean {
  return new Date(b.expires_at).getTime() > Date.now();
}

export async function upsertComp(b: CompBenchmark): Promise<CompBenchmark> {
  const db = getDb();
  if (!db) return b;
  await db.collection(COL.compBenchmarks).doc(b.id).set(b);
  return b;
}

export function buildExpiresAt(researchedAt: string): string {
  return new Date(new Date(researchedAt).getTime() + TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function listRecentLookups(limit = 20): Promise<CompBenchmark[]> {
  const db = getDb();
  if (!db) return [];
  const snap = await db.collection(COL.compBenchmarks).orderBy("updated_at", "desc").limit(limit).get();
  return snap.docs.map((d) => d.data() as CompBenchmark);
}
