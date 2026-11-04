"use client";

// Captures browser-side errors that aren't React-render errors:
//   • window 'error' events (synchronous throws, script load failures)
//   • window 'unhandledrejection' events (rejected promises that no .catch saw)
//
// React render errors are caught by global-error.tsx + per-segment error.tsx.
// User-reported bugs go through the Bug button in FloatingOverlay.

import { useEffect } from "react";

const REPORT_ENDPOINT = "/api/errors";

// Module-level dedupe — same (message + filename + line) within 30s is
// dropped on the client so a flapping iframe error doesn't spam our sink.
const RECENTLY_SENT = new Map<string, number>();
const DEDUPE_WINDOW_MS = 30_000;

function shouldDrop(key: string): boolean {
  const now = Date.now();
  const last = RECENTLY_SENT.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return true;
  RECENTLY_SENT.set(key, now);
  if (RECENTLY_SENT.size > 500) {
    const first = RECENTLY_SENT.keys().next().value;
    if (first !== undefined) RECENTLY_SENT.delete(first);
  }
  return false;
}

function post(payload: Record<string, unknown>): void {
  try {
    fetch(REPORT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {/* ignore */}
}

export default function ClientErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      const key = `${e.message}|${e.filename}|${e.lineno}`;
      if (shouldDrop(key)) return;
      post({
        name: e.error?.name ?? "Error",
        message: e.message ?? "(no message)",
        stack: e.error?.stack ?? null,
        path: window.location.pathname,
        source: "client",
        context: { filename: e.filename, lineno: e.lineno, colno: e.colno },
      });
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const name = reason?.name ?? "UnhandledRejection";
      const message = typeof reason === "string" ? reason : reason?.message ?? String(reason);
      const stack = reason?.stack ?? null;
      const key = `rej|${name}|${message.slice(0, 80)}`;
      if (shouldDrop(key)) return;
      post({
        name,
        message: message.slice(0, 1000),
        stack,
        path: window.location.pathname,
        source: "client",
        context: { kind: "unhandledrejection" },
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
