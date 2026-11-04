// In-memory token-bucket rate limiter for public endpoints.
//
// Cloud Run can scale to N instances — this limiter only enforces per-instance,
// so an attacker spreading across instances multiplies their effective rate.
// That's acceptable for v1 (the per-instance cap is still tight). When traffic
// justifies it, swap to a shared Firestore-backed limiter (or Redis/Memorystore).
//
// Usage:
//   const limited = applyRateLimit("feedback", clientIp, { capacity: 10, refillPerMin: 10 });
//   if (limited) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

type Bucket = { tokens: number; updatedAt: number };

const BUCKETS = new Map<string, Bucket>();
const MAX_KEYS = 5000;   // total unique (zone, ip) pairs we'll track

export type RateLimitConfig = {
  /** Maximum burst tokens — initial bucket size. */
  capacity: number;
  /** Tokens replenished per minute. Determines the steady-state rate. */
  refillPerMin: number;
};

/**
 * Returns true iff the request should be REJECTED (limit exceeded).
 * `zone` is a logical name (e.g. "feedback") so each endpoint has its own bucket.
 */
export function applyRateLimit(zone: string, clientKey: string, cfg: RateLimitConfig): boolean {
  if (!clientKey) return false;   // can't identify caller -> don't block
  const key = `${zone}::${clientKey}`;
  const now = Date.now();
  let b = BUCKETS.get(key);
  if (!b) {
    b = { tokens: cfg.capacity, updatedAt: now };
    BUCKETS.set(key, b);
    // Naive eviction — drop oldest when we hit the cap. Map maintains insertion order.
    if (BUCKETS.size > MAX_KEYS) {
      const firstKey = BUCKETS.keys().next().value;
      if (firstKey !== undefined) BUCKETS.delete(firstKey);
    }
  }
  // Refill
  const elapsedMin = (now - b.updatedAt) / 60_000;
  if (elapsedMin > 0) {
    b.tokens = Math.min(cfg.capacity, b.tokens + elapsedMin * cfg.refillPerMin);
    b.updatedAt = now;
  }
  if (b.tokens < 1) return true;
  b.tokens -= 1;
  return false;
}

/** Extracts the best-effort client IP from a Next.js Request. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
