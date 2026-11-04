// Streams a Claude-tailored resume back to the client.
// POST { jobId, baseResume? } → Server-Sent text stream.
//
// Constraints baked into the system prompt forbid fabrication; see
// src/lib/anthropic.ts.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getJob } from "@/lib/db";
import { getProfile } from "@/lib/db";
import { getAnthropic, TAILOR_RESUME_SYSTEM, buildTailorPrompt } from "@/lib/anthropic";
import { activeAssessmentsContext } from "@/lib/assessments";
import { getSessionUser } from "@/lib/auth";
import { checkQuota, quotaErrorBody, recordUsage } from "@/lib/quotas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  jobId: z.string().min(1),
  baseResume: z.string().max(40_000).optional(),
});

const MODEL = "claude-sonnet-4-6";   // current latest Sonnet
const MAX_TOKENS = 3000;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!user.record) return NextResponse.json({ error: "no_user_record" }, { status: 500 });

  // Free tier: 3 tailors / month. Pro+: unlimited. Admin: bypass.
  const gate = await checkQuota(user.record, "tailors");
  if (!gate.ok) {
    return NextResponse.json(quotaErrorBody(gate), { status: 402 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const client = getAnthropic();
  if (!client) {
    return NextResponse.json(
      { error: "anthropic_key_missing", help: "Set ANTHROPIC_API_KEY env var on Cloud Run." },
      { status: 503 }
    );
  }

  const [job, profile] = await Promise.all([getJob(user.uid, body.jobId), getProfile(user.uid)]);
  if (!job) return NextResponse.json({ error: "job_not_found" }, { status: 404 });

  const baseResume = body.baseResume?.trim() || profile.resume_md?.trim();
  if (!baseResume) {
    return NextResponse.json(
      { error: "no_base_resume", help: "Save a base resume in /settings before tailoring." },
      { status: 422 }
    );
  }

  const assessments = await activeAssessmentsContext(user.uid);
  const userPrompt = buildTailorPrompt(
    baseResume,
    job.title,
    job.company,
    job.description ?? "",
    {
      assessments,
      tuning_prompt: profile.tuning_prompt_md ?? null,
      level_up_targets: profile.level_up_targets ?? null,
      stay_with_targets: profile.stay_with_targets ?? null,
    },
  );

  // Charge the quota now that we're committed to running. Streaming routes
  // can't reliably charge at the end (client may disconnect), so we charge
  // on start — matches typical SaaS metering behavior.
  void recordUsage(user.record.id, "tailors");

  // Stream as plain text — easy to consume from useEffect on the client.
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const response = await client.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: TAILOR_RESUME_SYSTEM,
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
