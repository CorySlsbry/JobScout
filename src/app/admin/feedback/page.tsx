// /admin/feedback — triage table for the bug/feedback/feature submissions
// posted from the FloatingOverlay widget. Read across all users.

import { listAllFeedback } from "@/lib/feedback";
import type { Feedback, FeedbackStatus, FeedbackType } from "@/lib/types";
import { Bug, MessageSquare, Sparkles, ExternalLink, User as UserIcon } from "lucide-react";
import FeedbackStatusControl from "@/components/FeedbackStatusControl";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobScout · Admin · Feedback" };

export default async function AdminFeedbackPage() {
  const feedback = await listAllFeedback(300);
  const counts = countByStatus(feedback);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Feedback</p>
      <h1 className="font-[family-name:var(--font-inter-tight)] mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
        {feedback.length.toLocaleString()} submissions
      </h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {counts.open} open · {counts.in_progress} in progress · {counts.resolved} resolved · {counts.wont_fix} won&apos;t fix
      </p>

      <div className="mt-6 glass rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-[var(--muted)] border-b border-[var(--border)]">
              <th className="text-left p-3 font-medium">Type</th>
              <th className="text-left p-3 font-medium">Message</th>
              <th className="text-left p-3 font-medium">From</th>
              <th className="text-left p-3 font-medium">Page</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {feedback.length === 0 && (
              <tr><td colSpan={6} className="p-10 text-center text-[var(--muted)]">
                No feedback yet. The floating 🐛 BUG + 💬 FEEDBACK buttons land submissions here.
              </td></tr>
            )}
            {feedback.map((f) => (
              <tr key={f.id} className="border-b border-[var(--border)]/40 last:border-0 hover:bg-[var(--bg-elev-2)]/30 align-top">
                <td className="p-3"><TypePill type={f.type} /></td>
                <td className="p-3 max-w-xl">
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{f.message}</p>
                </td>
                <td className="p-3 text-xs text-[var(--muted)] whitespace-nowrap">
                  {f.user_email ? (
                    <span className="inline-flex items-center gap-1">
                      <UserIcon size={11} />
                      <span title={f.user_id ?? undefined}>{f.user_email}</span>
                    </span>
                  ) : (
                    <span className="opacity-60">visitor</span>
                  )}
                </td>
                <td className="p-3 text-xs text-[var(--muted)]">
                  <a href={f.page_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline decoration-[var(--accent-2)]/30 hover:text-[var(--accent-2)] max-w-[200px] truncate">
                    <span className="truncate">{shortenUrl(f.page_url)}</span>
                    <ExternalLink size={10} className="shrink-0" />
                  </a>
                </td>
                <td className="p-3"><FeedbackStatusControl id={f.id} status={f.status} /></td>
                <td className="p-3 text-xs text-[var(--muted)] tabular-nums whitespace-nowrap">
                  {fmtDate(f.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-[var(--muted)]">
        Change any item&apos;s status inline — it saves instantly + updates the unread badge in the sidebar. New submissions also email you the moment they land.
      </p>
    </div>
  );
}

function countByStatus(items: Feedback[]): Record<FeedbackStatus, number> {
  const c: Record<FeedbackStatus, number> = { open: 0, in_progress: 0, resolved: 0, wont_fix: 0 };
  for (const i of items) c[i.status] = (c[i.status] ?? 0) + 1;
  return c;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString();
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.length > 1 ? u.pathname : u.host;
  } catch {
    return url.slice(0, 40);
  }
}

function TypePill({ type }: { type: FeedbackType }) {
  const map: Record<FeedbackType, { icon: React.ReactNode; label: string; cls: string }> = {
    bug:      { icon: <Bug size={11} />,           label: "Bug",      cls: "bg-[var(--bad-soft)] text-[var(--bad)]" },
    feedback: { icon: <MessageSquare size={11} />, label: "Feedback", cls: "bg-[var(--accent-2-soft)] text-[var(--accent-2)]" },
    feature:  { icon: <Sparkles size={11} />,      label: "Feature",  cls: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  };
  const x = map[type] ?? map.feedback;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${x.cls}`}>{x.icon}{x.label}</span>;
}

