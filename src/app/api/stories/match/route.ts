// POST /api/stories/match
// Body: { jobId: string }
// Returns: { matches: [...], gaps: [...] } — which existing stories answer
// the likely behavioral questions for this job, and what's missing.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getJob } from "@/lib/db";
import { listStories } from "@/lib/stories";
import { getAnthropic, STORY_MATCH_SYSTEM, buildStoryMatchPrompt } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ jobId: z.string().min(1) });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const job = await getJob(user.uid, body.jobId);
  if (!job) return NextResponse.json({ error: "job_not_found" }, { status: 404 });

  const client = getAnthropic();
  if (!client) return NextResponse.json({ error: "anthropic_not_configured" }, { status: 503 });

  const stories = await listStories(user.uid);
  const trimmed = stories.map((s) => ({
    id: s.id,
    title: s.title,
    situation: s.situation,
    result: s.result,
    tags: s.tags,
    question_archetypes: s.question_archetypes,
  }));

  const prompt = buildStoryMatchPrompt(
    job.description ?? "",
    job.title,
    job.company,
    trimmed,
  );

  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1_500,
    system: STORY_MATCH_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = resp.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  const json = extractJson(raw);
  if (!json) {
    return NextResponse.json({ error: "match_parse_failed", raw: raw.slice(0, 400) }, { status: 502 });
  }
  return NextResponse.json({ ok: true, ...(json as object) });
}

function extractJson(text: string): unknown | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}
