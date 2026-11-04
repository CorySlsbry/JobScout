// User-record CRUD for multi-tenancy + billing.
//
// The User doc is the source of truth for tier + Stripe status. Created
// on first session, updated by the Stripe webhook, read by the
// feature-gate helpers (requireTier / hasFeature) on every gated endpoint.
//
// Single-tenant fallback: when Firestore isn't configured (local dev),
// we synthesize a User on the fly so getSessionUser() still works.

import { getDb, COL } from "./firestore";
import type { SessionUser } from "./auth";
import type { SubscriptionStatus, User, UserPlan, UserRole } from "./types";

// Admin override — these emails are pinned admin AND grandfathered to the
// highest plan regardless of Stripe state.
const ADMIN_EMAILS = [
  "cory.salisbury@gmail.com",
  "person1@example.com",   // alt Google account (same person)
];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

// 6-char base32-ish refer code. No ambiguous chars (0/O, 1/I/L) so users can
// verbally share. 32^6 ≈ 1B possibilities — collision-free at first ~30M users.
const REFER_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function generateReferCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += REFER_ALPHABET[Math.floor(Math.random() * REFER_ALPHABET.length)];
  return out;
}

export async function getUser(uid: string): Promise<User | null> {
  const db = getDb();
  if (!db) return null;
  const snap = await db.collection(COL.users).doc(uid).get();
  return snap.exists ? (snap.data() as User) : null;
}

// Loads-or-creates the user record from a SessionUser. Called by every
// route that needs tier info — the cost of a Firestore read is ~1ms.
export async function loadOrCreateUser(s: SessionUser): Promise<User> {
  const db = getDb();
  const now = new Date().toISOString();
  const adminOverride = isAdminEmail(s.email);
  if (!db) {
    // Local dev — no Firestore. Synthesize.
    return {
      id: s.uid,
      email: s.email ?? "",
      display_name: s.name,
      photo_url: null,
      role: adminOverride ? "admin" : "user",
      plan: adminOverride ? "boost" : "free",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_status: adminOverride ? "active" : "none",
      subscription_current_period_end: null,
      onboarded: false,
      refer_code: generateReferCode(),
      referred_by_code: null,
      referral_count: 0,
      created_at: now,
      last_seen_at: now,
    };
  }
  const ref = db.collection(COL.users).doc(s.uid);
  const snap = await ref.get();
  if (snap.exists) {
    const u = snap.data() as User;
    // Touch last_seen_at on a coarse cadence (once per hour) so we don't
    // hammer Firestore writes on every request.
    const last = new Date(u.last_seen_at).getTime();
    if (Number.isFinite(last) && Date.now() - last > 60 * 60 * 1000) {
      void ref.set({ last_seen_at: now }, { merge: true });
    }
    // Admin override: enforce admin + boost even if the stored doc is stale.
    if (adminOverride && (u.role !== "admin" || u.plan !== "boost")) {
      await ref.set({ role: "admin", plan: "boost", subscription_status: "active" }, { merge: true });
      return { ...u, role: "admin", plan: "boost", subscription_status: "active" };
    }
    // Backfill refer_code on legacy User docs that pre-date the referral system.
    if (!u.refer_code) {
      const code = generateReferCode();
      await ref.set({ refer_code: code, referred_by_code: u.referred_by_code ?? null, referral_count: u.referral_count ?? 0 }, { merge: true });
      return { ...u, refer_code: code, referred_by_code: u.referred_by_code ?? null, referral_count: u.referral_count ?? 0 };
    }
    return u;
  }
  const seeded: User = {
    id: s.uid,
    email: s.email ?? "",
    display_name: s.name,
    photo_url: null,
    role: adminOverride ? "admin" : "user",
    plan: adminOverride ? "boost" : "free",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: adminOverride ? "active" : "none",
    subscription_current_period_end: null,
    onboarded: false,
    refer_code: generateReferCode(),
    referred_by_code: null,
    referral_count: 0,
    created_at: now,
    last_seen_at: now,
  };
  await ref.set(seeded);
  return seeded;
}

// Find a user by their public refer_code (used when claiming a referral).
export async function getUserByReferCode(code: string): Promise<User | null> {
  const db = getDb();
  if (!db) return null;
  const snap = await db.collection(COL.users).where("refer_code", "==", code).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].data() as User;
}

/**
 * Stamp a refer code on the calling user (the one being referred), and
 * increment the inviter's referral_count. Idempotent: re-claiming the same
 * code on the same user is a no-op.
 *
 * Self-referral is blocked. Unknown codes are silently no-op.
 *
 * TODO(referral coupon): when inviter.referral_count crosses 2 AND those 2
 * referrals have stayed subscribed for 30+ days, auto-apply Stripe coupon
 * `JOBSCOUT_REFER_20`. Today: manual via Stripe Dashboard.
 */
export async function claimReferral(uid: string, code: string): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const cleanCode = code.trim().toUpperCase().slice(0, 6);
  if (!cleanCode) return { ok: false, reason: "empty_code" };

  const userRef = db.collection(COL.users).doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return { ok: false, reason: "user_not_found" };
  const user = userSnap.data() as User;

  if (user.referred_by_code) return { ok: false, reason: "already_claimed" };
  if (user.refer_code === cleanCode) return { ok: false, reason: "self_referral" };

  const inviter = await getUserByReferCode(cleanCode);
  if (!inviter) return { ok: false, reason: "unknown_code" };

  await userRef.set({ referred_by_code: cleanCode }, { merge: true });
  await db.collection(COL.users).doc(inviter.id).set({
    referral_count: (inviter.referral_count ?? 0) + 1,
  }, { merge: true });

  return { ok: true };
}

// Used by the Stripe webhook to apply tier changes.
export async function updateUser(uid: string, patch: Partial<User>): Promise<User | null> {
  const db = getDb();
  if (!db) return null;
  const ref = db.collection(COL.users).doc(uid);
  await ref.set(patch, { merge: true });
  const snap = await ref.get();
  return snap.exists ? (snap.data() as User) : null;
}

// ── Tier resolution + gating ───────────────────────────────────────────

const TIER_RANK: Record<UserPlan, number> = { free: 0, pro: 1, boost: 2 };
const ACCESS_GRANTING_STATUSES: SubscriptionStatus[] = ["active", "trialing"];

/** True if `user` has at least the given tier. Admin always passes. */
export function hasTier(user: User, min: UserPlan): boolean {
  if (user.role === "admin") return true;
  if (!ACCESS_GRANTING_STATUSES.includes(user.subscription_status) && user.plan !== "free") {
    // Subscription lapsed — they're on the plan record but Stripe isn't paying.
    // Effective tier collapses to free.
    return TIER_RANK.free >= TIER_RANK[min];
  }
  return TIER_RANK[user.plan] >= TIER_RANK[min];
}

/** Convenience: throw a typed error when a feature requires a tier the user doesn't have. */
export class TierRequiredError extends Error {
  constructor(public readonly required: UserPlan, public readonly current: UserPlan) {
    super(`tier_required:${required}`);
    this.name = "TierRequiredError";
  }
}

export function requireTier(user: User, min: UserPlan): void {
  if (!hasTier(user, min)) throw new TierRequiredError(min, user.plan);
}

// Exported helpers shared with API route guards.
export const TIER_RANK_TABLE = TIER_RANK;

export type ResolvedRole = UserRole;

// ── Admin UID resolution (used by crons) ───────────────────────────────
//
// Cron routes run unauthenticated (no user session), but every data-access
// function now requires a uid. The "owner" of cron-discovered data is the
// admin — that's what this helper resolves. Cached for 60s so we don't hit
// Firestore on every cron invocation.

type AdminUidCache = { uid: string; cachedAt: number } | null;
let adminUidCache: AdminUidCache = null;
const ADMIN_UID_CACHE_TTL_MS = 60 * 1000;

export async function getAdminUid(): Promise<string | null> {
  const now = Date.now();
  if (adminUidCache && now - adminUidCache.cachedAt < ADMIN_UID_CACHE_TTL_MS) {
    return adminUidCache.uid;
  }
  const db = getDb();
  if (!db) return null;
  const snap = await db.collection(COL.users).where("role", "==", "admin").limit(1).get();
  if (snap.empty) return null;
  const uid = snap.docs[0].id;
  adminUidCache = { uid, cachedAt: now };
  return uid;
}
