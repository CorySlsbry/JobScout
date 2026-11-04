"use client";

// Live calibration card. Sits on /settings under Career Context.
//
// Three controls all flow into every scorer/drafter prompt:
//   • Tuning prompt — free-text instructions for the scorer ("don't surface
//     anything that requires 5+ years as an engineer", "favor freelance over
//     salaried", "skip anything outside US time zones", etc.)
//   • Level Up chips — aspirational job/title anchors (Senior Solutions
//     Architect at AI labs, Forward Deployed Engineer at $200k+, …)
//   • Stay With chips — current-tier anchors that still pay well (Master
//     Technician at Tesla, GHL freelance retainer, …)
//
// The chip lists feed a hard rule into the scorer prompt: jobs above the
// Level Up ceiling skip as out_of_band_high_reach; jobs below the Stay
// With band skip as below_target_band. Boost for matches.

import { useState, useTransition } from "react";
import { Sparkles, Plus, X, ArrowUp, ArrowDownToLine } from "lucide-react";
import { saveCalibrationAction } from "@/app/actions";

type Props = {
  tuningPrompt: string | null;
  levelUp: string[];
  stayWith: string[];
};

export default function CalibrationCard({ tuningPrompt, levelUp, stayWith }: Props) {
  const [tuning, setTuning] = useState<string>(tuningPrompt ?? "");
  const [levelUpList, setLevelUpList] = useState<string[]>(levelUp);
  const [stayWithList, setStayWithList] = useState<string[]>(stayWith);
  const [levelUpInput, setLevelUpInput] = useState("");
  const [stayWithInput, setStayWithInput] = useState("");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  function addChip(setter: typeof setLevelUpList, list: string[], val: string) {
    const v = val.trim();
    if (!v) return;
    if (list.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    setter([...list, v]);
  }
  function removeChip(setter: typeof setLevelUpList, list: string[], idx: number) {
    setter(list.filter((_, i) => i !== idx));
  }

  function onSubmit(formData: FormData) {
    // The two chip lists ride in as newline-joined hidden inputs (the
    // server action splits on \n or ,).
    formData.set("level_up_targets", levelUpList.join("\n"));
    formData.set("stay_with_targets", stayWithList.join("\n"));
    start(async () => {
      await saveCalibrationAction(formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <section className="glass rounded-2xl p-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)] flex items-center gap-1.5">
          <Sparkles size={12} /> Aim &amp; calibration
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Tell the scorer how to calibrate. The tuning prompt + your two target bands get injected into every Upwork score, proposal draft, cover letter, and resume tailor.
        </p>
      </div>

      <form action={onSubmit} className="mt-3 space-y-4 text-sm">
        <label className="block">
          <span className="block text-xs font-medium text-[var(--muted)] mb-1">
            Tuning prompt
          </span>
          <textarea
            name="tuning_prompt_md"
            value={tuning}
            onChange={(e) => setTuning(e.target.value)}
            rows={4}
            placeholder={`e.g. "Tune this better to find jobs that are within my reach. Skip anything that requires 5+ years of formal engineering titles. Prioritize roles that value AI-native operators over traditional CS backgrounds. Block VP/director roles and anything below senior tech."`}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 font-mono text-xs leading-relaxed focus:border-[var(--accent-2)] outline-none"
          />
        </label>

        <ChipField
          label="Level Up targets"
          help="Stretch but reachable. The scorer favors jobs that match — and SKIPS jobs above this ceiling."
          accentIcon={<ArrowUp size={11} />}
          accentColor="var(--good)"
          list={levelUpList}
          input={levelUpInput}
          setInput={setLevelUpInput}
          onAdd={() => { addChip(setLevelUpList, levelUpList, levelUpInput); setLevelUpInput(""); }}
          onRemove={(i) => removeChip(setLevelUpList, levelUpList, i)}
          placeholder="e.g. Senior Solutions Architect at AI labs ($200k+ remote)"
        />

        <ChipField
          label="Stay With targets"
          help="Current-tier roles you're happy to take. The scorer favors these — and SKIPS jobs below this band."
          accentIcon={<ArrowDownToLine size={11} />}
          accentColor="var(--accent-2)"
          list={stayWithList}
          input={stayWithInput}
          setInput={setStayWithInput}
          onAdd={() => { addChip(setStayWithList, stayWithList, stayWithInput); setStayWithInput(""); }}
          onRemove={(i) => removeChip(setStayWithList, stayWithList, i)}
          placeholder="e.g. GHL specialist freelance retainer ($75-150/hr)"
        />

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn-cosmic text-sm disabled:opacity-50">
            {pending ? "Saving…" : "Save calibration"}
          </button>
          {saved && <span className="text-xs text-[var(--good)] font-medium">Saved ✓</span>}
        </div>
      </form>
    </section>
  );
}

function ChipField({
  label, help, accentIcon, accentColor, list, input, setInput, onAdd, onRemove, placeholder,
}: {
  label: string;
  help: string;
  accentIcon: React.ReactNode;
  accentColor: string;
  list: string[];
  input: string;
  setInput: (v: string) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  placeholder: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-[var(--muted)] mb-1">{label}</p>
      <p className="text-[11px] text-[var(--muted)]/80 mb-2">{help}</p>
      {list.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mb-2">
          {list.map((t, i) => (
            <li key={`${t}-${i}`}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-elev-2)] pl-2 pr-1 py-0.5 text-xs"
              style={{ borderColor: `${accentColor}55` }}>
              <span style={{ color: accentColor }} aria-hidden="true">{accentIcon}</span>
              <span className="max-w-[260px] truncate">{t}</span>
              <button type="button" onClick={() => onRemove(i)}
                aria-label={`Remove ${t}`}
                className="rounded-full p-0.5 text-[var(--muted)] hover:text-[var(--bad)] hover:bg-[var(--bg-elev)]">
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onAdd(); }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-sm focus:border-[var(--accent-2)] outline-none"
        />
        <button type="button" onClick={onAdd} disabled={!input.trim()}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--accent-2)] hover:border-[var(--accent-2)]/40 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1">
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}
