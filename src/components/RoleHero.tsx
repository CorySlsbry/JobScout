// Page hero — eyebrow, big serif title with optional gradient highlight,
// subtitle, and an optional right-side widget. Mirrors SpaOwner's RoleHero.

import type { ReactNode } from "react";

export default function RoleHero({
  eyebrow,
  title,
  highlight,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  /** Substring of `title` to render in gradient ink. Optional. */
  highlight?: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="hero-surface relative mb-8 rounded-card overflow-hidden">
      <div className="px-5 md:px-8 py-7 md:py-10 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-tiny uppercase tracking-widest text-fg-muted mb-2">
              {eyebrow}
            </div>
          )}
          <h1 className="font-display text-h1 md:text-display leading-tight tracking-tight">
            {renderTitle(title, highlight)}
          </h1>
          {subtitle && (
            <p className="mt-3 text-sm md:text-body text-fg-muted max-w-xl">
              {subtitle}
            </p>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}

function renderTitle(title: string, highlight?: string): ReactNode {
  if (!highlight || !title.includes(highlight)) return title;
  const [before, ...rest] = title.split(highlight);
  return (
    <>
      {before}
      <span className="text-gradient">{highlight}</span>
      {rest.join(highlight)}
    </>
  );
}
