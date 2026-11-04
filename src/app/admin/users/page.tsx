// /admin/users — full user table + plan override.
//
// Phase 1B-dependent: the manual "grant Pro/Boost" mutation needs to write to
// users/{uid} with role/plan/subscription_status patches. That's already done
// via lib/users.ts updateUser() which is OUTSIDE the Phase 1B refactor scope,
// so the table + manual override work today. The "their data preview" link
// (peek at a user's saved jobs) DOES depend on the new uid-scoped readers —
// that surfaces in the per-user detail view, post-1B.

import { getDb, COL } from "@/lib/firestore";
import type { User, UserPlan } from "@/lib/types";
import { Search, ShieldCheck, Mail } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobScout · Admin · Users" };

async function listUsers(): Promise<User[]> {
  const db = getDb();
  if (!db) return [];
  const snap = await db.collection(COL.users).orderBy("created_at", "desc").limit(500).get();
  return snap.docs.map((d) => d.data() as User);
}

export default async function AdminUsersPage() {
  const users = await listUsers();

  return (
    <div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Users</p>
        <h1 className="font-[family-name:var(--font-inter-tight)] mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
          {users.length.toLocaleString()} users — newest first
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Showing up to 500. Filter + manual-grant controls land post-Phase-1B.
        </p>
      </div>

      <div className="mt-6 glass rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--border)] p-3">
          <Search size={14} className="text-[var(--muted)]" />
          <input
            placeholder="Filter coming soon — sub-pages land post-Phase-1B"
            disabled
            className="bg-transparent text-sm placeholder:text-[var(--muted)] outline-none w-full disabled:cursor-not-allowed"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-[var(--muted)] border-b border-[var(--border)]">
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">Plan</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Role</th>
                <th className="text-left p-3 font-medium">Created</th>
                <th className="text-left p-3 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[var(--muted)]">
                    No users yet. (Will populate the moment public signups open.)
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--border)]/40 last:border-0 hover:bg-[var(--bg-elev-2)]/30">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Mail size={12} className="text-[var(--muted)] shrink-0" />
                      <span className="truncate" title={u.email}>{u.email || <em className="text-[var(--muted)]">no email</em>}</span>
                      {u.role === "admin" && (
                        <span title="admin" className="inline-flex">
                          <ShieldCheck size={12} className="text-[var(--accent-2)]" aria-label="admin" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3"><PlanPill plan={u.plan} /></td>
                  <td className="p-3 text-xs text-[var(--muted)]">{u.subscription_status ?? "—"}</td>
                  <td className="p-3 text-xs text-[var(--muted)]">{u.role}</td>
                  <td className="p-3 text-xs text-[var(--muted)] tabular-nums">{fmtDate(u.created_at)}</td>
                  <td className="p-3 text-xs text-[var(--muted)] tabular-nums">{fmtDate(u.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function PlanPill({ plan }: { plan: UserPlan }) {
  const map: Record<UserPlan, { label: string; cls: string }> = {
    free:  { label: "Free",  cls: "bg-[var(--bg-elev-2)] text-[var(--muted)]" },
    pro:   { label: "Pro",   cls: "bg-[var(--accent-soft)] text-[var(--accent)]" },
    boost: { label: "Boost", cls: "bg-[var(--accent-2-soft)] text-[var(--accent-2)]" },
  };
  const x = map[plan] ?? map.free;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${x.cls}`}>{x.label}</span>;
}
