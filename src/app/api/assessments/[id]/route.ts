// GET    /api/assessments/[id]   -> fetch
// PATCH  /api/assessments/[id]   -> partial update (name, summary_md, is_active)
// DELETE /api/assessments/[id]   -> delete

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { deleteAssessment, getAssessment, upsertAssessment } from "@/lib/assessments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  summary_md: z.string().min(1).max(50_000).optional(),
  is_active: z.boolean().optional(),
  source_url: z.string().url().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const a = await getAssessment(user.uid, id);
  if (!a) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, assessment: a });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const existing = await getAssessment(user.uid, id);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  let patch: z.infer<typeof PatchBody>;
  try { patch = PatchBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }
  const saved = await upsertAssessment(user.uid, { ...existing, ...patch });
  return NextResponse.json({ ok: true, assessment: saved });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await deleteAssessment(user.uid, id);
  return NextResponse.json({ ok: true });
}
