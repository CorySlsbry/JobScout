// Server-side auth helpers.
// Uses firebase-admin to verify session cookies set by /api/auth/session.

import { cookies } from "next/headers";
import { getApps as getAdminApps, initializeApp as initAdminApp, applicationDefault } from "firebase-admin/app";
import { getAuth as getAdminAuth, type DecodedIdToken } from "firebase-admin/auth";
import type { User } from "./types";
import { isAdminEmail, loadOrCreateUser } from "./users";

const SESSION_COOKIE = "jobscout_session";

function ensureAdminApp() {
  if (getAdminApps().length) return;
  initAdminApp({
    credential: applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
  });
}

export type SessionUser = {
  uid: string;
  email: string | null;
  email_verified: boolean;
  name: string | null;
  phone_number: string | null;
  is_admin: boolean;   // server-side admin flag (still kept for legacy gates; prefer `record.role`)
  /** Resolved user record from Firestore — present whenever GOOGLE_CLOUD_PROJECT is set. */
  record?: User;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  if (!process.env.GOOGLE_CLOUD_PROJECT) return null;
  ensureAdminApp();
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
    const base = toSessionUser(decoded);
    // Load (or seed-on-first-sight) the User record. Carries tier + Stripe state.
    try {
      const record = await loadOrCreateUser(base);
      base.record = record;
    } catch {
      // If users-collection lookup fails, return the base session — admin gates still work via is_admin.
    }
    return base;
  } catch {
    return null;
  }
}

export async function verifyIdToken(idToken: string): Promise<DecodedIdToken | null> {
  if (!process.env.GOOGLE_CLOUD_PROJECT) return null;
  ensureAdminApp();
  try { return await getAdminAuth().verifyIdToken(idToken, true); }
  catch { return null; }
}

export async function createSessionCookie(idToken: string, expiresInMs: number): Promise<string | null> {
  ensureAdminApp();
  try {
    return await getAdminAuth().createSessionCookie(idToken, { expiresIn: expiresInMs });
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function toSessionUser(d: DecodedIdToken): SessionUser {
  const email = (d.email as string | undefined) ?? null;
  return {
    uid: d.uid,
    email,
    email_verified: !!d.email_verified,
    name: (d.name as string | undefined) ?? null,
    phone_number: (d.phone_number as string | undefined) ?? null,
    is_admin: isAdminEmail(email),
  };
}
