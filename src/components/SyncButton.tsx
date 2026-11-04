"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { syncJobsAction } from "@/app/actions";

export default function SyncButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        onClick={() =>
          start(async () => {
            setMsg("Scanning sources…");
            const r = await syncJobsAction();
            setMsg(`Found ${r.scanned}, +${r.inserted} new, ${r.updated} updated.`);
          })
        }
        disabled={pending}
        className="btn-cosmic inline-flex items-center gap-2 disabled:opacity-50"
      >
        <RefreshCw size={16} className={pending ? "animate-spin" : ""} /> Sync now
      </button>
      {msg && <p className="text-xs text-[var(--muted)]">{msg}</p>}
    </div>
  );
}
