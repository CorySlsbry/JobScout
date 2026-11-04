// Streams a Claude-generated cover letter for a specific job.
// POST { jobId } → text/plain stream.
// Same no-fabrication constraints as the resume tailor — see src/lib/anthropic.ts.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getJob, getProfile } from "@/lib/db";
import { getAnthropic, COVER_LETTER_SYSTEM, buildCoverLetterPrompt } from "@/lib/anthropic";
import { activeAssessmentsContext } from "@/lib/assessments";
import { getSessionUser } from "@/lib/auth";
import { checkQuota, quotaErrorBody, recordUsage } from "@/lib/quotas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ jobId: z.string().min(1) });
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!user.record) return NextResponse.json({ error: "no_user_record" }, { status: 500 });

  // Free tier: 2 cover letters / month. Pro+: unlimited. Admin: bypass.
  const gate = await checkQuota(user.record, "cover_letters");
  if (!gate.ok) {
    return NextResponse.json(quotaErrorBody(gate), { status: 402 });
  }

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const client = getAnthropic();
  if (!client) {
    return NextResponse.json(
      { error: "anthropic_key_missing", help: "Set ANTHROPIC_API_KEY env var on Cloud Run." },
      { status: 503 },
    );
  }

  const [job, profile] = await Promise.all([getJob(user.uid, body.jobId), getProfile(user.uid)]);
  if (!job) return NextResponse.json({ error: "job_not_found" }, { status: 404 });

  const baseResume = profile.resume_md?.trim();
  if (!baseResume) {
    return NextResponse.json(
      { error: "no_base_resume", help: "Save a base resume in /settings before generating cover letters." },
      { status: 422 },
    );
  }

  const assessments = await activeAssessmentsContext(user.uid);
  const userPrompt = buildCoverLetterPrompt(baseResume, job.title, job.company, job.description ?? "", {
    career_story: profile.career_story_md ?? null,
    growth_goals: profile.growth_goals_md ?? null,
    assessments,
    tuning_prompt: profile.tuning_prompt_md ?? null,
    level_up_targets: profile.level_up_targets ?? null,
    stay_with_targets: profile.stay_with_targets ?? null,
  });

  // Charge quota on stream start (see tailor-resume for rationale).
  void recordUsage(user.record.id, "cover_letters");

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const response = await client.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: COVER_LETTER_SYSTEM,
          messages: [{ role: "user", content: userPrompt }],
        });
        for await (const event of response) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stream_failed";
        controller.enqueue(encoder.encode(`\n\n[error] ${msg}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
