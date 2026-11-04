// /admin layout — role-gated shell.
//
// Middleware already requires a valid session cookie for any non-public path,
// so we get here with a real Firebase Auth user. The second gate (this layout)
// promotes user.record.role === "admin" to the only allowed role. Anyone else
// gets bounced to /feed with a "not allowed" toast carrier.
//
// Pattern intentionally mirrors the SpaOwner-HQ and Neuron-HQ admin shells —
// left rail nav, glass shell, breadcrumbed header, top-right session pill.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getOpenFeedbackCount } from "@/lib/feedback";
import { Logo } from "@/components/Logo";
import {
  LayoutDashboard, Users, CreditCard, Activity, ArrowLeft, MessageSquare, BarChart3, Workflow, FileLock2, AlertOctagon, Heart,
} from "lucide-react";

export const metadata = { title: "JobScout · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect("/signin?from=/admin");
  if (session.record?.role !== "admin") redirect("/feed?denied=admin");

  // Unread-feedback badge — count of open + in-progress items, shown on the
  // Feedback nav item so new submissions are obvious the moment you load admin.
  const openFeedback = await getOpenFeedbackCount().catch(() => 0);

  return (
    <div className="min-h-screen bg-aurora flex flex-col sm:flex-row">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="sm:w-60 sm:shrink-0 border-b sm:border-b-0 sm:border-r border-[var(--border)] bg-[var(--bg-elev)]/40 backdrop-blur-xl">
        <div className="p-5 flex items-center justify-between">
          <Logo size="sm" />
          <span className="rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5">
            Admin
          </span>
        </div>
        <nav className="px-2 pb-4 space-y-0.5 text-sm">
          <NavLink href="/admin"           icon={<LayoutDashboard size={16} />}>Dashboard</NavLink>
          <NavLink href="/admin/users"     icon={<Users size={16} />}>Users</NavLink>
          <NavLink href="/admin/billing"   icon={<CreditCard size={16} />}>Billing</NavLink>
          <NavLink href="/admin/feedback"  icon={<MessageSquare size={16} />} badge={openFeedback}>Feedback</NavLink>
          <NavLink href="/admin/workflows" icon={<Workflow size={16} />}>Workflows</NavLink>
          <NavLink href="/admin/analytics" icon={<BarChart3 size={16} />}>Analytics</NavLink>
          <NavLink href="/admin/errors"    icon={<AlertOctagon size={16} />}>Errors</NavLink>
          <NavLink href="/admin/healing"   icon={<Heart size={16} />}>Self-healing</NavLink>
          <NavLink href="/admin/audit"     icon={<FileLock2 size={16} />}>Audit log</NavLink>
          <NavLink href="/admin/system"    icon={<Activity size={16} />}>System</NavLink>
        </nav>
        <div className="px-5 py-4 mt-2 border-t border-[var(--border)] text-xs text-[var(--muted)] space-y-2">
          <Link href="/feed" className="flex items-center gap-1.5 hover:text-[var(--fg)]">
            <ArrowLeft size={12} /> Back to app
          </Link>
          <p className="truncate" title={session.email ?? undefined}>
            Signed in as <strong className="text-[var(--fg)]">{session.email}</strong>
          </p>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────── */}
      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavLink({ href, icon, children, badge }: { href: string; icon: React.ReactNode; children: React.ReactNode; badge?: number }) {
  // Server component — `pathname` is not available, so we rely on hover/focus
  // for active styling. (For a true active-link highlight we'd hoist this to
  // a client component reading usePathname; not worth the JS bundle here.)
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2 rounded-xl text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-elev-2)]/60 transition-colors"
    >
      {icon}
      <span className="flex-1">{children}</span>
      {typeof badge === "number" && badge > 0 && (
        <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[var(--bad)] text-white text-[10px] font-bold px-1 tabular-nums">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
