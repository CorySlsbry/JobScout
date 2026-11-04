// GET    /api/stories          → list
// POST   /api/stories          → upsert {id?, title, situation, task, action, result, reflection, tags[], question_archetypes[]}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { listStories, upsertStory, newStoryId } from "@/lib/stories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Upsert = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1).max(200),
  situation: z.string().min(1).max(2_000),
  task: z.string().min(1).max(2_000),
  action: z.string().min(1).max(4_000),
  result: z.string().min(1).max(2_000),
  reflection: z.string().min(1).max(2_000),
  tags: z.array(z.string().max(40)).max(20).optional(),
  question_archetypes: z.array(z.string().max(200)).max(20).optional(),
  job_ids_used: z.array(z.string()).max(50).optional(),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stories = await listStories(user.uid);
  return NextResponse.json({ ok: true, stories });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: z.infer<typeof Upsert>;
  try { body = Upsert.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: "invalid_body", detail: e instanceof Error ? e.message : "?" }, { status: 400 }); }

  const story = await upsertStory(user.uid, {
    id: body.id ?? newStoryId(),
    title: body.title,
    situation: body.situation,
    task: body.task,
    action: body.action,
    result: body.result,
    reflection: body.reflection,
    tags: body.tags ?? [],
    question_archetypes: body.question_archetypes ?? [],
    job_ids_used: body.job_ids_used ?? [],
  });
  return NextResponse.json({ ok: true, story });
}
