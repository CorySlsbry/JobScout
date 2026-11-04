// In-house error monitoring — Sentry-grade capture, no third party.
//
// Coverage:
//   • Server route handler crashes — `instrumentation.ts` onRequestError hook
//   • Server unhandled rejections — process.on('unhandledRejection') in instrumentation
//   • Client window errors — components/ClientErrorReporter.tsx posts to /api/errors
//   • React render errors — app/global-error.tsx
//   • Manual capture from catch blocks — call captureError(err, ctx)
//
// Grouping: identical errors collapse to one group via a 12-char hash of
// (name + normalized message + first non-node_modules stack frame). Same
// algorithm Sentry uses.
//
// Cost protection: in-memory per-instance hourly counter per group_key.
// Past 100 occurrences/hour, sample at 1% so a runaway error storm can't
// blow up Firestore writes. The counter still increments; we just stop
// writing every event.

import { getDb, COL } from "./firestore";
import type { ErrorRecord, ErrorSource } from "./types";
import { createHash } from "node:crypto";

const RELEASE = process.env.K_REVISION ?? null;   // Cloud Run sets this per revision

// In-memory sampling. Resets every 60 min. Per Cloud Run instance.
const COUNTS = new Map<string, { count: number; windowStartMs: number }>();
const SAMPLE_AFTER = 100;          // start sampling after N hits per hour per group
const SAMPLE_RATE = 0.01;          // keep 1 in 100 once we're in sampling mode
const HOUR_MS = 60 * 60 * 1000;

export type CaptureContext = {
  source: ErrorSource;
  path?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  user_agent?: string | null;
  integration?: string | null;
  context?: Record<string, unknown> | null;
};

function makeId(): string {
  return "err_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

/** Compute the grouping hash. Same algorithm as Sentry — name + normalized
 *  message + first non-noise stack frame, SHA-256, first 12 hex chars. */
export function groupKey(name: string, message: string, stack: string | null): string {
  // Normalize the message — strip ids, hex blobs, big numbers — so
  // "User abc123 not found" and "User def456 not found" hash the same.
  const norm = message
    .toLowerCase()
    .replace(/0x[0-9a-f]+/gi, "*")
    .replace(/\b[0-9a-f]{8,}\b/gi, "*")
    .replace(/\b\d{4,}\b/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);

  // First non-noise stack frame
  const firstFrame = (stack ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) =>
      l.length > 0
      && !l.includes("node_modules")
      && !l.includes("webpack-internal")
      && !l.includes("/_next/")
      && !l.startsWith("at process.")
    ) ?? "";

  return createHash("sha256").update(`${name}|${norm}|${firstFrame}`).digest("hex").slice(0, 12);
}

/** Decide if we should sample-drop this error. Pure in-memory, per-instance. */
function shouldSampleDrop(key: string): boolean {
  const now = Date.now();
  let bucket = COUNTS.get(key);
  if (!bucket || now - bucket.windowStartMs > HOUR_MS) {
    bucket = { count: 0, windowStartMs: now };
    COUNTS.set(key, bucket);
    // Naive eviction so we don't grow unbounded
    if (COUNTS.size > 5000) {
      const first = COUNTS.keys().next().value;
      if (first !== undefined) COUNTS.delete(first);
    }
  }
  bucket.count++;
  if (bucket.count > SAMPLE_AFTER) {
    return Math.random() > SAMPLE_RATE;  // drop 99% past the threshold
  }
  return false;
}

/** Normalize unknown thrown values into { name, message, stack }. */
function normalizeError(err: unknown): { name: string; message: string; stack: string | null } {
  if (err instanceof Error) {
    return {
      name: err.name || "Error",
      message: err.message || "(no message)",
      stack: err.stack ? err.stack.slice(0, 6000) : null,
    };
  }
  if (typeof err === "string") return { name: "StringThrow", message: err.slice(0, 1000), stack: null };
  try {
    return { name: "ObjectThrow", message: JSON.stringify(err).slice(0, 1000), stack: null };
  } catch {
    return { name: "UnknownThrow", message: String(err).slice(0, 1000), stack: null };
  }
}

/** Capture an error. Fire-and-forget — never throws, never blocks the caller. */
export async function captureError(err: unknown, ctx: CaptureContext): Promise<void> {
  try {
    const { name, message, stack } = normalizeError(err);
    const key = groupKey(name, message, stack);

    // Always log to stderr for Cloud Logs even if we sample-drop.
    if (typeof console !== "undefined") {
      console.error(`[captureError ${ctx.source}] ${name}: ${message} [group=${key}]`);
    }

    if (shouldSampleDrop(key)) return;

    const db = getDb();
    if (!db) return;

    const now = new Date();
    const doc: ErrorRecord = {
      id: makeId(),
      group_key: key,
      message: message.slice(0, 1000),
      name,
      stack,
      source: ctx.source,
      path: ctx.path?.slice(0, 500) ?? null,
      user_id: ctx.user_id ?? null,
      user_email: ctx.user_email ?? null,
      user_agent: ctx.user_agent?.slice(0, 500) ?? null,
      release: RELEASE,
      integration: ctx.integration?.slice(0, 60) ?? null,
      context: ctx.context ?? null,
      status: "open",
      created_at: now.toISOString(),
      created_day: now.toISOString().slice(0, 10),
    };
    await db.collection(COL.errors).doc(doc.id).set(doc);
  } catch (capErr) {
    // The capture path itself threw. Last-ditch console log.
    if (typeof console !== "undefined") console.error("[captureError] FAILED to capture:", capErr);
  }
}

/** List recent error groups, aggregated. For /admin/errors. */
export async function listErrorGroups(limit = 500): Promise<Array<{
  group_key: string;
  count: number;
  latest: ErrorRecord;
  affected_users: number;
  sources: ErrorSource[];
}>> {
  const db = getDb();
  if (!db) return [];
  let docs: ErrorRecord[] = [];
  try {
    const snap = await db.collection(COL.errors).orderBy("created_at", "desc").limit(limit).get();
    docs = snap.docs.map((d) => d.data() as ErrorRecord);
  } catch {
    return [];
  }
  const groups = new Map<string, ErrorRecord[]>();
  for (const e of docs) {
    const arr = groups.get(e.group_key) ?? [];
    arr.push(e);
    groups.set(e.group_key, arr);
  }
  return Array.from(groups.entries())
    .map(([group_key, arr]) => {
      arr.sort((a, b) => b.created_at.localeCompare(a.created_at));
      const uniqUsers = new Set(arr.map((e) => e.user_id).filter(Boolean));
      const uniqSources = Array.from(new Set(arr.map((e) => e.source)));
      return {
        group_key,
        count: arr.length,
        latest: arr[0]!,
        affected_users: uniqUsers.size,
        sources: uniqSources,
      };
    })
    .sort((a, b) => b.latest.created_at.localeCompare(a.latest.created_at));
}

/** Count errors of a given integration within the last `ms` milliseconds.
 *  Used by the anthropic_circuit_breaker healer. */
export async function countIntegrationErrorsSince(integration: string, ms: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const since = new Date(Date.now() - ms).toISOString();
  try {
    const agg = await db.collection(COL.errors)
      .where("integration", "==", integration)
      .where("created_at", ">=", since)
      .count().get();
    return agg.data().count;
  } catch {
    try {
      const snap = await db.collection(COL.errors)
        .where("integration", "==", integration)
        .where("created_at", ">=", since)
        .limit(500).get();
      return snap.size;
    } catch { return 0; }
  }
}
