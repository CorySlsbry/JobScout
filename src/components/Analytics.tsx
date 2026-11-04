"use client";

// GA4 + page-view + custom-event hookup.
//
// Mounts the gtag scripts ONLY when NEXT_PUBLIC_GA_MEASUREMENT_ID is set
// (so it stays out of bundles in dev / preview). Also fires synthetic
// page_view events on App Router navigation (Next's <Script> only fires
// once at first paint).
//
// Custom events go through `window.gtag('event', name, params)` — see
// lib/analytics.ts for the typed wrapper used by landing-page CTAs.

import Script from "next/script";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { gtag?: (...args: any[]) => void; dataLayer?: any[] }
}

export default function Analytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // SPA page-view tracking. Next.js doesn't auto-fire on client-side route
  // changes, so we push manually whenever pathname/search changes.
  useEffect(() => {
    if (!measurementId || typeof window === "undefined" || !window.gtag) return;
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
    window.gtag("event", "page_view", { page_path: url });
  }, [pathname, searchParams, measurementId]);

  if (!measurementId) return null;

  return (
    <>
      <Script
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${measurementId}', { send_page_view: true });
        `}
      </Script>
    </>
  );
}
