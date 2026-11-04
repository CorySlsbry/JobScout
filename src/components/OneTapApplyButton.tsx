"use client";

// One-tap apply: opens the source URL in a new tab AND auto-marks the job applied.
// True form-fill (LinkedIn EasyApply etc.) needs Playwright + Member API approval —
// this is the pragmatic version that works against every board today.

import { useTransition } from "react";
import { ExternalLink, Send } from "lucide-react";
import { applyAction } from "@/app/actions";

export default function OneTapApplyButton({
  jobId, applyUrl, isApplied,
}: { jobId: string; applyUrl: string; isApplied: boolean }) {
  const [pending, start] = useTransition();

  function go() {
    // Open in a new tab synchronously so the popup blocker doesn't fire.
    window.open(applyUrl, "_blank", "noopener,noreferrer");
    if (!isApplied) {
      const fd = new FormData();
      fd.set("job_id", jobId);
      start(async () => { await applyAction(fd); });
    }
  }

  return (
    <button
      onClick={go}
      disabled={pending}
      className="btn-cosmic w-full inline-flex items-center justify-center gap-2 disabled:opacity-50"
    >
      {isApplied ? (
        <>
          <ExternalLink size={16} /> Open application
        </>
      ) : (
        <>
          <Send size={16} /> {pending ? "Applying…" : "Apply with one tap"}
        </>
      )}
    </button>
  );
}
