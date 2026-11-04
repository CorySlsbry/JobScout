// Browser-extension token management.
// POST   /api/profile/extension-token   → generate + save (returns plaintext ONCE)
// DELETE /api/profile/extension-token   → revoke
//
// Requires an authenticated session AND a Pro/Boost plan — the extension is
// the Pro-tier killer feature. Admins always pass the tier gate.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { updateProfile } from "@/lib/db";
import { generateExtensionToken } from "@/lib/extension-auth";
import { hasTier } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!user.record || !hasTier(user.record, "pro")) {
    return NextResponse.json({
      error: "tier_required",
      help: "The browser extension is a Pro feature ($19/mo). Upgrade in Settings → Billing.",
      required_tier: "pro",
      current_tier: user.record?.plan ?? "free",
    }, { status: 402 });
  }
  const { plaintext, hash } = generateExtensionToken();
  await updateProfile(user.uid, {
    extension_token_hash: hash,
    extension_token_created_at: new Date().toISOString(),
  });
  // Plaintext is returned ONCE; we only ever store the hash.
  return NextResponse.json({
    ok: true,
    token: plaintext,
    note: "Save this now — it is only shown once. Paste into the JobScout extension options.",
  });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // No tier gate on revoke — anyone with a token should be able to nuke it.
  await updateProfile(user.uid, { extension_token_hash: null, extension_token_created_at: null });
  return NextResponse.json({ ok: true });
}
