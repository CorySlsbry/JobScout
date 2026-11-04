// POST /api/feedback — submit a bug report, feature request, or open note.
//
// Accepts both authenticated (session cookie) and unauthenticated submissions.
// Unauthenticated submissions are rate-limited via Cloud Run defaults; honest
// abuse-prevention belongs at the edge if this ever sees real volume.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createFeedback } from "@/lib/feedback";
import { applyRateLimit, clientIp } from "@/lib/rate-limit";
import { getMailer, FROM_DEFAULT } from "@/lib/email";
import type { Feedback, FeedbackType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: ReadonlyArray<FeedbackType> = ["bug", "feedback", "feature"];

// Where new-submission alerts go. Override with FEEDBACK_NOTIFY_EMAIL.
const NOTIFY_EMAIL = process.env.FEEDBACK_NOTIFY_EMAIL ?? "cory.salisbury@gmail.com";

// Fire-and-forget: email the admin the instant feedback lands so they see it
// even when not in /admin. Never blocks or fails the submission.
function notifyAdmin(doc: Feedback): void {
  const mailer = getMailer();
  if (!mailer) return;
  const typeLabel = doc.type === "bug" ? "🐛 Bug" : doc.type === "feature" ? "✨ Feature request" : "💬 Feedback";
  const from = doc.user_email ? `${doc.user_email}` : "an anonymous visitor";
  void mailer.sendMail({
    from: FROM_DEFAULT,
    to: NOTIFY_EMAIL,
    subject: `JobScout ${typeLabel} from ${from}`,
    text: [
      `${typeLabel}`,
      `From: ${from}`,
      `Page: ${doc.page_url || "—"}`,
      ``,
      doc.message,
      ``,
      `Triage it: https://jobscout-hq.com/admin/feedback`,
    ].join("\n"),
  }).catch(() => { /* never let an email failure break the submission */ });
}

export async function POST(req: Request) {
  // Rate limit: 10 submits/min/IP burst, replenish 10/min. Stops button-mash + form-bot abuse.
  if (applyRateLimit("feedback", clientIp(req), { capacity: 10, refillPerMin: 10 })) {
    return NextResponse.json({ error: "rate_limited", help: "Too many submissions — try again in a minute." }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const type = b.type as FeedbackType | undefined;
  const message = typeof b.message === "string" ? b.message.trim() : "";
  const page_url = typeof b.page_url === "string" ? b.page_url : "";

  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "invalid_type", help: `type must be one of ${VALID_TYPES.join(" | ")}` }, { status: 400 });
  }
  if (!message || message.length < 3) {
    return NextResponse.json({ error: "message_too_short", help: "message must be at least 3 characters" }, { status: 400 });
  }

  const session = await getSessionUser();
  const user_agent = req.headers.get("user-agent");

  const doc = await createFeedback({
    type,
    message,
    page_url,
    user_agent,
    user_id: session?.uid ?? null,
    user_email: session?.email ?? null,
  });

  // Instant admin email — fire-and-forget so it never delays the response.
  notifyAdmin(doc);

  return NextResponse.json({ ok: true, id: doc.id, status: doc.status });
}
