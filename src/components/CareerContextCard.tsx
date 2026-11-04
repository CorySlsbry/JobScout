// "Who you want to become + what to avoid" — the context that turns the AI
// scorer from a keyword-matcher into something that reasons about fit.
// Ported from santifer/career-ops's profile.yml shape (career story + avoid
// + growth goals), but Markdown free-text so it's flexible.

import RoleSection from "@/components/RoleSection";
import { saveCareerContextAction } from "@/app/actions";

export default function CareerContextCard({
  careerStory,
  avoid,
  growthGoals,
}: {
  careerStory: string | null;
  avoid: string | null;
  growthGoals: string | null;
}) {
  return (
    <RoleSection
      title="Career context"
      lede="The resume tells the AI what you've done. These fields tell it where you're going, what to avoid, and how to evaluate fit. Used by every Upwork score and every proposal draft."
    >
      <form action={saveCareerContextAction} className="space-y-4 text-sm">
        <Field
          label="Career story"
          hint="200-400 words. The narrative arc. Where you've been, what you're optimizing for next, why."
        >
          <textarea
            name="career_story_md"
            defaultValue={careerStory ?? ""}
            rows={6}
            placeholder="I spent 7 years at Tesla / Rivian on the high-voltage diagnostic side, then pivoted into AI-assisted automation… I'm optimizing the next move for…"
            className="form-input font-mono text-xs"
          />
        </Field>

        <Field
          label="Growth goals"
          hint="Where you're trying to land. Job titles, scope, comp band, geography, anything specific."
        >
          <textarea
            name="growth_goals_md"
            defaultValue={growthGoals ?? ""}
            rows={4}
            placeholder="Applied AI Solutions Architect — building agentic systems for vertical SaaS. $200k+ remote, US time zones, ideally pre-IPO Series B/C…"
            className="form-input font-mono text-xs"
          />
        </Field>

        <Field
          label="What to avoid"
          hint="Red flags. Roles, employer types, tech stacks, or schedules that should auto-skip in scoring."
        >
          <textarea
            name="avoid_md"
            defaultValue={avoid ?? ""}
            rows={4}
            placeholder="- No agencies / staffing firms&#10;- No on-call rotations or pager duty&#10;- No anything that requires being in an office&#10;- No Salesforce/SAP-heavy roles"
            className="form-input font-mono text-xs"
          />
        </Field>

        <button type="submit" className="btn-premium">Save career context</button>
      </form>
    </RoleSection>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-fg mb-0.5">{label}</span>
      {hint && <span className="block text-tiny text-fg-muted mb-1.5">{hint}</span>}
      {children}
    </label>
  );
}
