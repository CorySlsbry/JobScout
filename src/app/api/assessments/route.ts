// GET  /api/assessments              -> list (admin session)
// POST /api/assessments              -> create new (admin session)

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { listAssessments, upsertAssessment, newAssessmentId } from "@/lib/assessments";
import type { AssessmentKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = ["paste", "image", "pdf", "text", "url"] as const;

const CreateBody = z.object({
  name: z.string().min(1).max(200),
  summary_md: z.string().min(1).max(50_000),
  raw_text: z.string().max(200_000).optional().nullable(),
  source_kind: z.enum(KINDS),
  source_filename: z.string().max(200).optional().nullable(),
  source_url: z.string().url().optional().nullable(),
  is_active: z.boolean().optional(),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = await listAssessments(user.uid);
  return NextResponse.json({ ok: true, assessments: items });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: z.infer<typeof CreateBody>;
  try { body = CreateBody.parse(await req.json()); }
  catch (e) {
    const msg = e instanceof Error ? e.message : "invalid_body";
    return NextResponse.json({ error: "invalid_body", detail: msg }, { status: 400 });
  }
  const saved = await upsertAssessment(user.uid, {
    id: newAssessmentId(),
    name: body.name,
    summary_md: body.summary_md,
    raw_text: body.raw_text ?? null,
    source_kind: body.source_kind as AssessmentKind,
    source_filename: body.source_filename ?? null,
    source_url: body.source_url ?? null,
    is_active: body.is_active ?? true,
  });
  return NextResponse.json({ ok: true, assessment: saved });
}
