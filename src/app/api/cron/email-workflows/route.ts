// GET /api/cron/email-workflows?token=$CRON_TOKEN
//
// Daily sweep over every User row. For each user, every workflow's match()
// predicate decides whether to fire. Sends via SMTP, stamps the matching
// field on the User row to prevent re-send. Audits each fire.
//
// Designed to be safe to re-run — match() predicates check stamp fields so
// double-runs are idempotent.

import { NextResponse } from "next/server";
import { getDb, COL } from "@/lib/firestore";
import { getMailer, FROM_DEFAULT } from "@/lib/email";
import { ALL_WORKFLOWS } from "@/lib/email-workflows";
import { updateUser } from "@/lib/users";
import { recordEvent } from "@/lib/events-log";
import { recordAudit } from "@/lib/audit-log";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_TOKEN || url.searchParams.get("token") !== process.env.CRON_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ error: "firestore_not_configured" }, { status: 503 });

  const mailer = getMailer();
  if (!mailer) {
    return NextResponse.json({
      error: "smtp_not_configured",
      help: "Set SMTP_HOST/SMTP_USER/SMTP_PASS on Cloud Run to enable email workflows.",
    }, { status: 503 });
  }

  // Fetch all users in one shot. At our scale this is fine; once we cross
  // ~10k users we'll paginate by created_at.
  const snap = await db.collection(COL.users).get();
  const users = snap.docs.map((d) => d.data() as User);
  const now = Date.now();
  const ctx = { now };

  type FireResult = { uid: string; workflow: string; ok: boolean; err?: string };
  const fires: FireResult[] = [];

  for (const user of users) {
    if (!user.email) continue;
    for (const wf of ALL_WORKFLOWS) {
      if (!wf.match(user, ctx)) continue;
      const email = wf.build(user);
      try {
        await mailer.sendMail({
          from: FROM_DEFAULT,
          to: user.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
        // Stamp the stampField on User
        const stamp: Partial<User> = { [wf.stampField]: new Date().toISOString() };
        await updateUser(user.id, stamp);

        void recordEvent({
          name: `email_workflow_${wf.id}`,
          user_id: user.id,
          props: { workflow: wf.id, recipient: user.email },
        });
        void recordAudit({
          action: `email.${wf.id}`,
          actor_kind: "cron",
          target_user_id: user.id,
          payload: { subject: email.subject },
          note: `transactional ${wf.id} sent`,
        });
        fires.push({ uid: user.id, workflow: wf.id, ok: true });
      } catch (e) {
        const err = e instanceof Error ? e.message.slice(0, 200) : "unknown";
        fires.push({ uid: user.id, workflow: wf.id, ok: false, err });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    scanned_users: users.length,
    total_fires: fires.length,
    succeeded: fires.filter((f) => f.ok).length,
    failed: fires.filter((f) => !f.ok).length,
    by_workflow: ALL_WORKFLOWS.reduce<Record<string, number>>((acc, wf) => {
      acc[wf.id] = fires.filter((f) => f.workflow === wf.id && f.ok).length;
      return acc;
    }, {}),
    failures: fires.filter((f) => !f.ok).slice(0, 20),
  });
}
