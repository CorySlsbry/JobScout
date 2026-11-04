"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useTransition } from "react";

const PRESETS = [
  { key: "remote",    label: "Remote",     param: "remote",   value: "1" },
  { key: "stgeorge",  label: "St George",  param: "stgeorge", value: "1" },
  { key: "high",      label: "High match", param: "min",      value: "70" },
  { key: "unapplied", label: "Unapplied",  param: "status",   value: "unapplied" },
] as const;

export default function FilterBar() {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function toggle(param: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (next.get(param) === value) next.delete(param);
    else next.set(param, value);
    startTransition(() => router.push(`/feed?${next.toString()}`));
  }

  function setQ(q: string) {
    const next = new URLSearchParams(sp.toString());
    if (q) next.set("q", q);
    else next.delete("q");
    startTransition(() => router.push(`/feed?${next.toString()}`));
  }

  return (
    <div className="sticky top-0 z-20 bg-[var(--bg)]/85 backdrop-blur-xl border-b border-[var(--border-soft)]">
      <div className="px-4 pt-3 pb-2">
        <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2.5 focus-within:border-[var(--accent-2)] transition-colors">
          <Search size={18} className="text-[var(--muted)] shrink-0" />
          <input
            defaultValue={sp.get("q") ?? ""}
            type="search"
            inputMode="search"
            placeholder="Search title, company, keyword…"
            className="flex-1 bg-transparent outline-none placeholder:text-[var(--muted)]"
            onChange={(e) => {
              const v = e.target.value;
              if (typeof window !== "undefined") {
                clearTimeout((window as unknown as { __qTimer?: number }).__qTimer);
                (window as unknown as { __qTimer?: number }).__qTimer = window.setTimeout(() => setQ(v), 250);
              }
            }}
          />
          {pending && <span className="text-xs text-[var(--muted)]">…</span>}
        </label>
      </div>
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
        {PRESETS.map((p) => {
          const active = sp.get(p.param) === p.value;
          return (
            <button
              key={p.key}
              onClick={() => toggle(p.param, p.value)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium border transition-all ${
                active
                  ? "text-white border-transparent shadow-lg shadow-[var(--accent-2)]/20"
                  : "bg-[var(--bg-elev)] text-[var(--fg)] border-[var(--border)] hover:border-[var(--accent-2)]"
              }`}
              style={active ? { background: "var(--grad-cosmic)" } : undefined}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
