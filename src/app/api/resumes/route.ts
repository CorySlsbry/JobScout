// Resume create + list endpoints.
// POST  /api/resumes          { name, content_md, source_kind, source_filename?, setActive? }
// GET   /api/resumes          → { resumes: Resume[] }

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createResume, listResumes } from "@/lib/resumes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().min(1).max(120),
  content_md: z.string().min(20).max(80_000),
  source_kind: z.enum(["paste", "pdf", "docx", "md", "txt"]),
  source_filename: z.string().max(200).nullable().optional(),
  setActive: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch (e) {
    const msg = e instanceof z.ZodError ? e.issues.map((i) => i.message).join("; ") : "invalid_body";
    return NextResponse.json({ error: "invalid_body", detail: msg }, { status: 400 });
  }

  const created = await createResume(user.uid, body);
  return NextResponse.json({ ok: true, resume: created });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const resumes = await listResumes(user.uid);
  return NextResponse.json({ resumes });
}
