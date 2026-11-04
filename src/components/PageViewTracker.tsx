"use client";

// Fires a `page_view` event on every client-side navigation. Captures
// the document.referrer hostname (only on the very first hit per tab) and
// a long-lived anonymous session_id stored in localStorage. Mounted once
// in the root layout — must be wrapped in <Suspense> because usePathname
// + useSearchParams suspend during the streaming SSR phase.

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SESSION_KEY = "jbsk_sid";        // analytics session cookie (HTTP-readable, persists 30 days)
const REFERRER_SENT_KEY = "jbsk_rs";   // marks the referrer as already sent for this tab

function ensureSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      // crypto.randomUUID is widely available in modern browsers; fall back to a hand-rolled id otherwise
      sid = (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `sid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return null;
  }
}

function getReferrerDomainOnce(): string | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  try {
    if (sessionStorage.getItem(REFERRER_SENT_KEY)) return null;
    sessionStorage.setItem(REFERRER_SENT_KEY, "1");
    const ref = document.referrer;
    if (!ref) return null;
    const u = new URL(ref);
    // Strip "www." prefix for cleaner aggregation
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export default function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    // Avoid double-firing on the same path. App Router can re-render with
    // identical pathname when only the search params change; we DO want to
    // log those as separate page views (different intent / referrer params).
    const key = pathname + "?" + (searchParams?.toString() ?? "");
    if (lastPathRef.current === key) return;
    lastPathRef.current = key;

    const sid = ensureSessionId();
    const referrerDomain = getReferrerDomainOnce();

    const params: Record<string, string> = {};
    if (referrerDomain) params.referrer_domain = referrerDomain;
    const intent = searchParams?.get("intent");
    if (intent) params.intent = intent;
    const ref = searchParams?.get("ref");
    if (ref) params.ref = ref;

    try {
      fetch("/api/analytics/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "page_view",
          path: pathname,
          session_id: sid,
          referrer_domain: referrerDomain,
          params,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // never throw from analytics
    }
  }, [pathname, searchParams]);

  return null;
}
