"use client";

// Captures ?ref=CODE on landing and stores it in a 90-day cookie so the
// subsequent signup flow can claim the referral. Mounted on landing pages
// (page.tsx + pricing/page.tsx). Renders nothing — pure side-effect.
//
// 6-char alphanumeric only; anything else is silently ignored so this can't
// be used to set arbitrary cookies.

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const COOKIE_NAME = "jobscout_refer_code";
const MAX_AGE_DAYS = 90;

export default function ReferralCapture() {
  const params = useSearchParams();
  useEffect(() => {
    if (typeof document === "undefined" || !params) return;
    const raw = params.get("ref");
    if (!raw) return;
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    if (clean.length < 4) return;
    const maxAge = MAX_AGE_DAYS * 24 * 60 * 60;
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(clean)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }, [params]);
  return null;
}
