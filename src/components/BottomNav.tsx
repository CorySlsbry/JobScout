"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Send, BarChart3, Settings, Briefcase, Rocket } from "lucide-react";

const TABS = [
  { href: "/feed",         label: "Feed",     icon: Sparkles },
  { href: "/autopilot",    label: "Pilot",    icon: Rocket },
  { href: "/applied",      label: "Applied",  icon: Send },
  { href: "/upwork-leads", label: "Upwork",   icon: Briefcase },
  { href: "/dashboard",    label: "Trends",   icon: BarChart3 },
  { href: "/settings",     label: "Settings", icon: Settings },
] as const;

const HIDDEN_ON: ReadonlyArray<string | RegExp> = [
  "/",            // marketing landing
  "/pricing",
  "/about",
  /^\/signin/,
];

export default function BottomNav() {
  const pathname = usePathname() ?? "/";
  const hidden = HIDDEN_ON.some((m) => (typeof m === "string" ? m === pathname : m.test(pathname)));
  if (hidden) return null;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 border-t border-[var(--border)] bg-[var(--bg-elev)]/85 backdrop-blur-xl pb-safe"
      role="navigation"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-6 max-w-md mx-auto">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="contents">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                  active ? "text-[var(--accent-2)]" : "text-[var(--muted)] hover:text-[var(--fg)]"
                }`}
              >
                {active && (
                  <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-gradient-to-r from-[var(--accent-2)] to-[var(--accent)]" />
                )}
                <Icon size={22} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
