// Settings/dashboard section — display title, muted lede, glass-card body.
// Mirrors SpaOwner's `<section>` rhythm.

import type { ReactNode } from "react";

export default function RoleSection({
  title,
  lede,
  children,
  shimmer,
}: {
  title: string;
  lede?: string;
  children: ReactNode;
  /** Adds the animated brand-gradient shimmer overlay used on premium sections. */
  shimmer?: boolean;
}) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-h2 mb-1">{title}</h2>
      {lede && <p className="text-fg-muted text-sm mb-5 max-w-2xl">{lede}</p>}
      <div className={`glass-card p-5 md:p-6 ${shimmer ? "tile-shimmer" : ""}`}>
        {children}
      </div>
    </section>
  );
}
