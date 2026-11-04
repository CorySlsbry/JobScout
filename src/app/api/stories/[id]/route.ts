// DELETE /api/stories/[id]

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteStory } from "@/lib/stories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteStory(user.uid, id);
  return NextResponse.json({ ok: true });
}
