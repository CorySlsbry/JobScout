// PATCH /api/admin/feedback/[id]  body: { status, admin_notes? }
//
// Admin-only. Lets Cory triage a feedback/bug item from /admin/feedback —
// flip it Open → In progress → Resolved → Won't fix, optionally with a note.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { setFeedbackStatus } from "@/lib/feedback";
import { recordAudit } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  status: z.enum(["open", "in_progress", "resolved", "wont_fix"]),
  admin_notes: z.string().max(2000).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.record?.role !== "admin") {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  await setFeedbackStatus(id, body.status, body.admin_notes);
  void recordAudit({
    action: "feedback.status_change",
    actor_kind: "admin",
    actor_id: user.uid,
    actor_email: user.email,
    target_resource: `feedback:${id}`,
    payload: { status: body.status },
  });
  return NextResponse.json({ ok: true, id, status: body.status });
}
