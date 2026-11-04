// Firestore admin client. On Cloud Run we use Application Default Credentials
// (the service account is provided automatically). Locally we either use the
// Firestore emulator (FIRESTORE_EMULATOR_HOST=localhost:8080) or fall back
// to in-memory mode by leaving GOOGLE_CLOUD_PROJECT unset.

import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedApp: App | null = null;
let cachedDb: Firestore | null = null;
let settingsApplied = false;

export function getDb(): Firestore | null {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) return null;

  if (!cachedApp) {
    cachedApp = getApps()[0] ?? initializeApp({
      credential: applicationDefault(),
      projectId,
    });
  }
  if (!cachedDb) {
    cachedDb = getFirestore(cachedApp);
    // settings() throws if called twice or after any other method. Wrap
    // defensively for hot-reload + concurrent first-request scenarios.
    if (!settingsApplied) {
      try {
        cachedDb.settings({ ignoreUndefinedProperties: true });
      } catch {
        // already initialized — fine, defaults are acceptable.
      }
      settingsApplied = true;
    }
  }
  return cachedDb;
}

export function isFirestoreConfigured(): boolean {
  return !!process.env.GOOGLE_CLOUD_PROJECT;
}

// Collection names — keep them centralized so refactors stay simple.
export const COL = {
  profile: "profile",
  jobs: "jobs",
  applications: "applications",
  alertLog: "alert_log",
  searchRuns: "search_runs",
  resumes: "resumes",
  stories: "stories",
  upworkLeads: "upwork_leads",
  assessments: "assessments",
  users: "users",
  usageCounters: "usage_counters",   // per-user-per-month rate-limit buckets (free tier)
  compBenchmarks: "comp_benchmarks", // Boost-tier comp lookup cache
  feedback: "feedback",              // user-submitted bug reports + feature requests + free-form feedback
  events: "events",                  // in-house analytics event log (one doc per event fire)
  auditLog: "audit_log",             // append-only record of admin actions + user-data mutations
  errors: "errors",                  // captured runtime errors (server + client) — in-house Sentry
  healEvents: "heal_events",         // self-healing engine — one row per healer run
  systemState: "system_state",       // shared service-state docs (circuit breaker, last-cleanup, etc.)
} as const;
