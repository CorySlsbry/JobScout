// Waitlist signup endpoint. Persists to Firestore `waitlist` collection.
// Used by the marketing landing's GetStartedModal.

import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/firestore";
import { applyRateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email().max(200),
  source: z.string().max(100).optional(),
  ref: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  // Public anon endpoint — rate-limit to stop signup-spammer bots.
  if (applyRateLimit("waitlist", clientIp(req), { capacity: 10, refillPerMin: 10 })) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const db = getDb();
  if (db) {
    // Use sha256 of the canonical email for the doc id. The old "replace
    // non-alphanumeric with _" approach collided on common variants
    // (person1@example.com and person2@example.com both → foo_bar_x_com). Hash is collision-safe.
    const canonical = body.email.trim().toLowerCase();
    const id = createHash("sha256").update(canonical).digest("hex").slice(0, 24);
    await db.collection("waitlist").doc(id).set({
      email: body.email,
      email_canonical: canonical,
      source: body.source ?? "landing",
      ref: body.ref ?? null,
      created_at: new Date().toISOString(),
    }, { merge: true });
  }

  return NextResponse.json({ ok: true });
}
