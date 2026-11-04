// /comp — Boost-tier Comp Intelligence page.
//
// Server-renders the header + locked-state messaging for non-Boost users.
// The actual search UI is a client component that hits /api/comp/lookup.

import Link from "next/link";
import { ArrowLeft, Crown, Lock } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { hasTier } from "@/lib/users";
import CompLookup from "@/components/CompLookup";
import { listRecentLookups } from "@/lib/comp";

export const dynamic = "force-dynamic";

export default async function CompPage() {
  const user = await getSessionUser();
  const isBoost = user?.record ? hasTier(user.record, "boost") : false;
  const recent = isBoost ? await listRecentLookups(8) : [];

  return (
    <div className="pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-[var(--bg)]/85 backdrop-blur-xl px-4 sm:px-6 py-3 border-b border-[var(--border-soft)]">
        <Link href="/feed" className="rounded-full p-1.5 hover:bg-[var(--bg-elev)] text-[var(--muted)] hover:text-[var(--fg)]" aria-label="Back">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="font-[family-name:var(--font-inter-tight)] text-base font-bold leading-tight inline-flex items-center gap-1.5">
            Comp Intelligence <Crown size={14} className="text-[var(--accent-2)]" />
          </h1>
          <p className="text-[11px] text-[var(--muted)]">Per-company, per-role compensation benchmarks · Boost tier</p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
        {!user && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] p-6 text-center">
            <p className="text-sm text-[var(--muted)]">Sign in to use Comp Intelligence.</p>
            <Link href="/signin" className="btn-cosmic mt-3 inline-block text-sm">Sign in</Link>
          </div>
        )}

        {user && !isBoost && (
          <div className="rounded-2xl border border-[var(--accent-2)]/30 bg-[var(--accent-2-soft)] p-6 text-center">
            <Lock size={28} className="mx-auto text-[var(--accent-2)]" />
            <h2 className="mt-3 font-semibold">Boost tier required</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Comp Intelligence ($29/mo) pulls per-company salary benchmarks researched by Claude with
              web search, cached for 7 days. Pairs with the one-tap negotiation playbook.
            </p>
            <Link href="/settings" className="btn-cosmic mt-4 inline-flex items-center gap-2 text-sm">
              <Crown size={14} /> Upgrade to Boost
            </Link>
          </div>
        )}

        {isBoost && (
          <>
            <CompLookup />
            {recent.length > 0 && (
              <section className="mt-10">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)] mb-3">
                  Recent lookups
                </h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {recent.map((b) => (
                    <li key={b.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)] p-3">
                      <p className="text-sm font-semibold truncate">{b.company} · {b.role}</p>
                      <p className="text-[11px] text-[var(--muted)]">{b.level ?? "Any level"} · {b.geography ?? "Any geo"}</p>
                      {(b.total_low != null && b.total_high != null) ? (
                        <p className="text-xs font-mono mt-1">
                          ${b.total_low.toLocaleString()}–${b.total_high.toLocaleString()} total
                        </p>
                      ) : (
                        <p className="text-xs text-[var(--muted)] mt-1">No total band stated</p>
                      )}
                      <p className="text-[10px] text-[var(--muted)] mt-1">
                        Researched {new Date(b.researched_at).toLocaleDateString()} · {b.confidence}% confidence
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
