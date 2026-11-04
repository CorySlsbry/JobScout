"use client";

// Next.js 16 global error boundary. Triggered when the root layout itself
// throws OR an unrecovered React render error bubbles up. Logs to the
// in-house error monitor AND shows a graceful recovery UI.
//
// Per Next docs this is the ONLY place that can replace the <html> shell,
// so it must include its own <html> + <body>.

import { useEffect } from "react";
import { AlertOctagon } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Best-effort post to our error sink. Anon-friendly endpoint.
    try {
      fetch("/api/errors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: error.name || "Error",
          message: error.message || "(no message)",
          stack: error.stack || null,
          path: typeof window !== "undefined" ? window.location.pathname : null,
          digest: error.digest ?? null,
          source: "client",
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {/* ignore */}
  }, [error]);

  return (
    <html lang="en" data-theme="aurora">
      <body className="min-h-screen flex items-center justify-center p-6 bg-bg text-fg" style={{ background: "#0a0613", color: "#f5f3ff", fontFamily: "system-ui, -apple-system, Inter, sans-serif" }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 16, background: "#1f1530", border: "1px solid #3d2a55", color: "#fca5a5", marginBottom: 18 }}>
            <AlertOctagon size={28} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
            Something broke.
          </h1>
          <p style={{ color: "#8b85a8", fontSize: 14, lineHeight: 1.6, margin: "0 0 22px" }}>
            We logged it automatically — the team is already looking. You can try again, or head back home.
            {error.digest && <span style={{ display: "block", marginTop: 10, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>error id: {error.digest}</span>}
          </p>
          <div style={{ display: "inline-flex", gap: 8 }}>
            <button onClick={reset} style={{ background: "linear-gradient(135deg, #a855f7, #06b6d4)", color: "white", padding: "10px 22px", borderRadius: 14, fontWeight: 700, border: "none", cursor: "pointer" }}>Try again</button>
            <a href="/" style={{ display: "inline-flex", alignItems: "center", padding: "10px 22px", border: "1px solid #2d2640", borderRadius: 14, color: "#cfc8e3", textDecoration: "none" }}>Home</a>
          </div>
        </div>
      </body>
    </html>
  );
}
