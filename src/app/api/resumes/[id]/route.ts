// Per-resume mutations.
// PATCH  /api/resumes/[id]   body: { name? } | { setActive: true }
// DELETE /api/resumes/[id]

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { setActiveResume, renameResume, deleteResume } from "@/lib/resumes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.union([
  z.object({ name: z.string().min(1).max(120) }),
  z.object({ setActive: z.literal(true) }),
]);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  let body: z.infer<typeof PatchBody>;
  try { body = PatchBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  if ("setActive" in body) {
    const updated = await setActiveResume(user.uid, id);
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, resume: updated });
  }
  const renamed = await renameResume(user.uid, id, body.name);
  if (!renamed) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, resume: renamed });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const result = await deleteResume(user.uid, id);
  if (!result.deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...result });
}
