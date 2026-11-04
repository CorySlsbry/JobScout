// Persists onboarding fields to the signed-in user's profile.
// Called from the AuthForm after sign-up + from /onboarding when the user
// fills out the remaining fields.
//
// Side effects on FIRST persist (i.e. when this is the signup-time call):
//   • Claim referral if the caller sent a `refer_code` (from the ?ref= cookie)
//   • Fire the welcome-email workflow

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { updateProfile } from "@/lib/db";
import { claimReferral } from "@/lib/users";
import { runOnSignup } from "@/lib/workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  uid: z.string().min(1).optional(),  // not trusted; we read uid from session
  full_name: z.string().min(2).max(120).optional(),
  phone: z.string().min(7).max(40).optional(),
  salary_floor: z.number().min(0).max(2_000_000).optional(),
  remote_pref: z.enum(["remote_only", "remote_first", "hybrid_ok", "onsite_ok"]).optional(),
  target_locations: z.array(z.string().max(80)).max(8).optional(),
  onboarding_complete: z.boolean().optional(),
  // Optional referral code captured from the ?ref= cookie on landing.
  refer_code: z.string().max(8).optional(),
  // First-time signup persist? Determines whether we fire welcome email.
  is_signup: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  await updateProfile(user.uid, {
    full_name: body.full_name,
    email: user.email ?? undefined,
    phone: body.phone ?? undefined,
    salary_floor: body.salary_floor,
    remote_pref: body.remote_pref,
    target_locations: body.target_locations,
  });

  // Side effects (best-effort — never fail the user's request on these)
  if (body.refer_code) {
    void claimReferral(user.uid, body.refer_code).catch(() => {});
  }
  if (body.is_signup) {
    void runOnSignup({
      uid: user.uid,
      email: user.email ?? "",
      full_name: body.full_name ?? user.name ?? "there",
      refer_code: user.record?.refer_code,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
