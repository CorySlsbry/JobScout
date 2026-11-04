// Client-side analytics helpers. Wraps window.gtag with a typed API + a
// secondary "internal event" channel that POSTs to /api/analytics/event so
// we can show counts in /admin/analytics without depending on the GA Data API.

export type CtaEvent =
  | "cta_landing_hero_signup"
  | "cta_landing_demo"
  | "cta_landing_pro"
  | "cta_landing_boost"
  | "cta_landing_final"
  | "cta_pricing_free"
  | "cta_pricing_pro"
  | "cta_pricing_boost"
  | "cta_chat_opened"
  | "feedback_submitted"
  | "bug_submitted";

/** Fire a custom event into GA4 + the internal event-counter. Safe to call from any client component. */
export function trackEvent(name: CtaEvent | string, params: Record<string, string | number | boolean> = {}): void {
  if (typeof window === "undefined") return;
  // GA4
  try { window.gtag?.("event", name, params); } catch { /* gtag may not be loaded */ }
  // Internal counter — fire-and-forget so it never blocks the UI
  try {
    fetch("/api/analytics/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, params, ts: Date.now(), path: window.location.pathname }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
