// Single-button server-action wrapper that hides a job from the user's feed.
// Lives next to the existing dismiss / save controls on /jobs/[id]. Click =
// the job disappears from /feed; restore lives at /trash.

import { hideJobAction } from "@/app/actions";
import { Trash2 } from "lucide-react";

export default function HideJobButton({ jobId }: { jobId: string }) {
  return (
    <form action={hideJobAction}>
      <input type="hidden" name="job_id" value={jobId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:border-[var(--bad)] hover:text-[var(--bad)] transition-colors"
        title="Remove from feed (you can restore from /trash)"
      >
        <Trash2 size={13} /> Remove from feed
      </button>
    </form>
  );
}
