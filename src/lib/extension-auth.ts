// Auth for the browser extension. The user generates a bearer token in
// /settings and pastes it into the extension's options. The extension sends
// it as `Authorization: Bearer <token>` on every API call. We never store
// the plaintext — only sha256.

import { createHash, randomBytes } from "node:crypto";
import type { SessionUser } from "./auth";
import { getDb, COL } from "./firestore";
import { isAdminEmail } from "./users";
import type { Profile, User } from "./types";

export const TOKEN_PREFIX = "jbsk_";

/** Generates a fresh extension token. Returns plaintext + hash. */
export function generateExtensionToken(): { plaintext: string; hash: string } {
  const raw = randomBytes(24).toString("base64url");
  const plaintext = TOKEN_PREFIX + raw;
  const hash = createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, hash };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Reads `Authorization: Bearer …` and returns the owning user if it matches
 * a stored hash. Token-to-uid lookup scans profile docs (small N — one per
 * Pro+ user) for `extension_token_hash`.
 */
export async function authenticateExtension(req: Request): Promise<SessionUser | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const db = getDb();
  if (!db) return null;
  const candidateHash = hashToken(token);
  const snap = await db
    .collection(COL.profile)
    .where("extension_token_hash", "==", candidateHash)
    .limit(1)
    .get();
  if (snap.empty) return null;

  const profile = snap.docs[0].data() as Profile;
  const uid = profile.user_id;
  if (!uid) return null;

  // Resolve the owning user record for tier checks.
  let record: User | undefined;
  const userSnap = await db.collection(COL.users).doc(uid).get();
  if (userSnap.exists) record = userSnap.data() as User;

  const adminOverride = isAdminEmail(profile.email);
  if (!record) {
    // Fall back to a synthesized record so the request can still complete on
    // older profiles that haven't seen loadOrCreateUser run yet.
    record = {
      id: uid,
      email: profile.email,
      display_name: profile.full_name,
      photo_url: null,
      role: adminOverride ? "admin" : "user",
      plan: adminOverride ? "boost" : "pro",   // tokens are issued only to Pro+
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_status: "active",
      subscription_current_period_end: null,
      onboarded: true,
      refer_code: "",          // backfilled when this user next loads via loadOrCreateUser
      referred_by_code: null,
      referral_count: 0,
      created_at: profile.created_at,
      last_seen_at: new Date().toISOString(),
    };
  }
  return {
    uid,
    email: profile.email,
    email_verified: true,
    name: profile.full_name,
    phone_number: profile.phone,
    is_admin: adminOverride || record!.role === "admin",
    record,
  };
}
