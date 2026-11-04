"use client";

import { useState, useTransition } from "react";
import { Ban, Search, RotateCcw } from "lucide-react";
import { unbanCompanyAction } from "@/app/actions";

export default function BannedCompaniesCard({ initial }: { initial: string[] }) {
  const [list, setList] = useState<string[]>([...initial].sort((a, b) => a.localeCompare(b)));
  const [filter, setFilter] = useState("");
  const [pending, start] = useTransition();

  const filtered = filter.trim()
    ? list.filter((c) => c.toLowerCase().includes(filter.toLowerCase()))
    : list;

  function unban(company: string) {
    start(async () => {
      const fd = new FormData();
      fd.set("company", company);
      await unbanCompanyAction(fd);
      setList((prev) => prev.filter((c) => c.toLowerCase() !== company.toLowerCase()));
    });
  }

  return (
    <section className="glass rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">
            Banned companies <span className="text-[var(--muted)] font-medium">· {list.length}</span>
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Jobs from these companies never reach your feed. Click <strong className="text-[var(--fg)]">Unban</strong> to start seeing them again on the next sync.
          </p>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
          Nothing banned. Tap <strong className="text-[var(--fg)]">Ban [Company]</strong> on any job detail page to add one.
        </p>
      ) : (
        <>
          {list.length > 6 && (
            <label className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-1.5 text-sm focus-within:border-[var(--accent-2)]">
              <Search size={14} className="text-[var(--muted)] shrink-0" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter…"
                className="flex-1 bg-transparent outline-none placeholder:text-[var(--muted)] text-sm"
              />
            </label>
          )}

          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
            {filtered.map((company) => (
              <li key={company}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-2.5 py-1.5 text-sm">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Ban size={12} className="shrink-0 text-[var(--bad)]/70" />
                  <span className="truncate">{company}</span>
                </span>
                <button
                  onClick={() => unban(company)}
                  disabled={pending}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)] hover:text-[var(--accent-2)] hover:border-[var(--accent-2)]/40 disabled:opacity-50"
                >
                  <RotateCcw size={11} /> Unban
                </button>
              </li>
            ))}
          </ul>

          {filter && filtered.length === 0 && (
            <p className="mt-3 text-xs text-[var(--muted)]">No banned companies match &quot;{filter}&quot;.</p>
          )}
        </>
      )}
    </section>
  );
}
