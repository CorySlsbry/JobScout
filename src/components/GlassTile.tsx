// Small metric tile — used in dashboard headers, settings page, etc.
// Mirrors the SpaOwner GlassTile shape: label / value / sub / dot.

import type { ReactNode } from "react";

export default function GlassTile({
  label,
  value,
  sub,
  dotColor,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  dotColor?: string;
}) {
  return (
    <div className="glass-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-tiny uppercase tracking-wider text-fg-muted">
        {dotColor && (
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: dotColor }}
          />
        )}
        {label}
      </div>
      <div className="text-fg leading-tight">{value}</div>
      {sub && <div className="text-tiny text-fg-faint">{sub}</div>}
    </div>
  );
}
