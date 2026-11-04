"use client";

// Per-row status selector on /admin/feedback. Flips a feedback item's status
// via PATCH /api/admin/feedback/[id], then refreshes the server component so
// the counts + badge update.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import type { FeedbackStatus } from "@/lib/types";

const OPTIONS: Array<{ value: FeedbackStatus; label: string }> = [
  { value: "open",        label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved",    label: "Resolved" },
  { value: "wont_fix",    label: "Won't fix" },
];

const COLOR: Record<FeedbackStatus, string> = {
  open:        "border-[var(--accent-2)]/40 text-[var(--accent-2)] bg-[var(--accent-2-soft)]",
  in_progress: "border-[var(--accent)]/40 text-[var(--accent)] bg-[var(--accent-soft)]",
  resolved:    "border-[var(--good)]/40 text-[var(--good)] bg-[var(--good-soft)]",
  wont_fix:    "border-[var(--border)] text-[var(--muted)] bg-[var(--bg-elev-2)]",
};

export default function FeedbackStatusControl({ id, status }: { id: string; status: FeedbackStatus }) {
  const router = useRouter();
  const [value, setValue] = useState<FeedbackStatus>(status);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(false);

  function change(next: FeedbackStatus) {
    const prev = value;
    setValue(next);
    setErr(false);
    start(async () => {
      try {
        const r = await fetch(`/api/admin/feedback/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: next }),
        });
        if (!r.ok) throw new Error(String(r.status));
        setSaved(true);
        setTimeout(() => setSaved(false), 1200);
        router.refresh();
      } catch {
        setValue(prev);   // revert on failure
        setErr(true);
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value as FeedbackStatus)}
        className={`rounded-full border px-2 py-1 text-[11px] font-semibold outline-none cursor-pointer disabled:opacity-50 ${COLOR[value]}`}
      >
        {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {pending && <Loader2 size={12} className="animate-spin text-[var(--muted)]" />}
      {saved && !pending && <Check size={12} className="text-[var(--good)]" />}
      {err && <span className="text-[10px] text-[var(--bad)]">retry</span>}
    </span>
  );
}
