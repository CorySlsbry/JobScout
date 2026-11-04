"use client";

// Negotiation script generator — opens a modal, asks for the offer details,
// returns a tailored script. Use on jobs marked as "offer" status.

import { useState } from "react";
import { Handshake, X, Loader2, AlertCircle, Copy } from "lucide-react";

type Plan = {
  headline_strategy: string;
  counter_offer: {
    base: number | null;
    equity_notes: string | null;
    signing_bonus: number | null;
    rationale: string;
  };
  talking_points: Array<{ label: string; script: string }>;
  leverage_signals: string[];
  watch_outs: string[];
};

export default function NegotiateButton({
  jobTitle,
  company,
  jobDescription,
}: {
  jobTitle: string;
  company: string;
  jobDescription?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);

  async function generate(formData: FormData) {
    setBusy(true); setError(null); setPlan(null);
    try {
      const offer = {
        base: numOrUndef(formData.get("offer_base")),
        equity: strOrUndef(formData.get("offer_equity")),
        signing: numOrUndef(formData.get("offer_signing")),
        benefits: strOrUndef(formData.get("offer_benefits")),
        location: strOrUndef(formData.get("offer_location")),
      };
      const role = {
        title: jobTitle,
        company,
        level: strOrUndef(formData.get("role_level")),
        geography: strOrUndef(formData.get("role_geography")),
        description: jobDescription ?? undefined,
      };
      const resp = await fetch("/api/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offer, role,
          competing_offers: strOrUndef(formData.get("competing_offers")),
          candidate_leverage: strOrUndef(formData.get("candidate_leverage")),
        }),
      });
      const j = await resp.json();
      if (!resp.ok) {
        setError((j as { error?: string; help?: string }).help ?? (j as { error?: string }).error ?? "request_failed");
        return;
      }
      setPlan((j as { plan: Plan }).plan);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "fetch_error");
    } finally { setBusy(false); }
  }

  function reset() { setPlan(null); setError(null); }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-premium-outline inline-flex items-center gap-2 text-sm">
        <Handshake size={15} /> Negotiate
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm" onClick={() => !busy && setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="glass-card relative w-full max-w-2xl max-h-[88vh] flex flex-col rounded-card">
            <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                <Handshake size={16} className="text-accent" />
                <span className="font-semibold truncate">Negotiate: {jobTitle} · {company}</span>
              </div>
              <button onClick={() => !busy && setOpen(false)} disabled={busy} aria-label="Close" className="rounded-full p-1.5 text-fg-muted hover:text-fg hover:bg-bg-elev">
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5">
              {!plan && !busy && (
                <form action={generate} className="space-y-3 text-sm">
                  <p className="text-fg-muted text-xs mb-2">Fill in what they offered. The script anchors on these numbers + your resume + career context.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Base salary (USD)"><input name="offer_base" type="number" min={0} step={1000} className="form-input" /></Field>
                    <Field label="Signing bonus (USD)"><input name="offer_signing" type="number" min={0} step={1000} className="form-input" /></Field>
                  </div>
                  <Field label="Equity (free-form)"><input name="offer_equity" placeholder="e.g. 0.15% over 4yrs, 1yr cliff" className="form-input" /></Field>
                  <Field label="Location they're offering"><input name="offer_location" placeholder="e.g. remote, NYC, hybrid SF" className="form-input" /></Field>
                  <Field label="Benefits / PTO notes"><textarea name="offer_benefits" rows={2} className="form-input" /></Field>
                  <hr className="border-border my-3" />
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Role level / band"><input name="role_level" placeholder="e.g. Sr / Staff / L6" className="form-input" /></Field>
                    <Field label="Your geography"><input name="role_geography" placeholder="e.g. St George UT, remote-only" className="form-input" /></Field>
                  </div>
                  <Field label="Competing offers (factual — never invent)">
                    <textarea name="competing_offers" rows={2} placeholder="e.g. Anthropic $230k base + 0.1%, exploring with OpenAI" className="form-input font-mono text-xs" />
                  </Field>
                  <Field label="Your leverage (things they should know)">
                    <textarea name="candidate_leverage" rows={2} placeholder="e.g. shipped 4 vertical SaaS apps to revenue, ex-Tesla diagnostic, owns infrastructure" className="form-input font-mono text-xs" />
                  </Field>
                  <button type="submit" className="btn-premium">Generate negotiation script</button>
                </form>
              )}

              {busy && (
                <div className="flex items-center gap-2 text-fg-muted text-sm">
                  <Loader2 size={16} className="animate-spin" /> Drafting negotiation strategy with Claude Sonnet…
                </div>
              )}

              {error && (
                <div className="rounded-card border border-danger/40 bg-danger/10 p-4 text-sm text-danger flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Couldn&apos;t generate</p>
                    <p className="mt-1 opacity-90">{error}</p>
                  </div>
                </div>
              )}

              {plan && (
                <article className="space-y-4 text-sm">
                  <section>
                    <h3 className="text-tiny uppercase tracking-widest text-accent mb-1">Strategy</h3>
                    <p>{plan.headline_strategy}</p>
                  </section>

                  <section className="glass-card p-4">
                    <h3 className="text-tiny uppercase tracking-widest text-accent mb-1">Counter offer</h3>
                    <div className="font-mono text-base">
                      {plan.counter_offer.base != null && <div>Base: <strong>${plan.counter_offer.base.toLocaleString()}</strong></div>}
                      {plan.counter_offer.signing_bonus != null && <div>Signing: <strong>${plan.counter_offer.signing_bonus.toLocaleString()}</strong></div>}
                      {plan.counter_offer.equity_notes && <div className="text-fg-muted text-xs mt-1">Equity: {plan.counter_offer.equity_notes}</div>}
                    </div>
                    <p className="text-xs text-fg-muted mt-2">{plan.counter_offer.rationale}</p>
                  </section>

                  <section>
                    <h3 className="text-tiny uppercase tracking-widest text-accent mb-2">Talking points</h3>
                    <div className="space-y-2">
                      {plan.talking_points.map((tp, i) => (
                        <div key={i} className="rounded-card border border-border bg-bg-elev/60 p-3">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-semibold">{tp.label}</span>
                            <button onClick={() => navigator.clipboard.writeText(tp.script)} className="text-tiny text-fg-muted hover:text-accent inline-flex items-center gap-1">
                              <Copy size={11} /> copy
                            </button>
                          </div>
                          <p className="text-sm">{tp.script}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {plan.leverage_signals?.length > 0 && (
                    <section>
                      <h3 className="text-tiny uppercase tracking-widest text-success mb-1">Leverage to surface</h3>
                      <ul className="list-disc pl-5 text-xs space-y-1">
                        {plan.leverage_signals.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </section>
                  )}

                  {plan.watch_outs?.length > 0 && (
                    <section>
                      <h3 className="text-tiny uppercase tracking-widest text-warning mb-1">Watch-outs</h3>
                      <ul className="list-disc pl-5 text-xs space-y-1">
                        {plan.watch_outs.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </section>
                  )}

                  <div className="pt-2">
                    <button onClick={reset} className="btn-premium-outline text-xs">Regenerate with different inputs</button>
                  </div>
                </article>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-fg-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

function numOrUndef(v: FormDataEntryValue | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(String(v));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
function strOrUndef(v: FormDataEntryValue | null): string | undefined {
  const s = String(v ?? "").trim();
  return s.length ? s : undefined;
}
