import type { NextConfig } from "next";

// Security headers — applied to every response. These are the
// most-impactful defaults for a SaaS that handles user resumes + payments.
const SECURITY_HEADERS = [
  // Mitigates MIME-confusion attacks.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Hard ban iframing — clickjacking defence.
  { key: "X-Frame-Options", value: "DENY" },
  // Referrer info: send origin only on cross-site, full path same-site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HSTS: 2 years, include subdomains, preload-eligible.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Cross-origin isolation for the document — blocks reading our origin
  // from other windows / cross-origin scripts.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // No third-party platform features by default — turn each on per route if needed.
  // (We allow camera/mic OFF, geolocation OFF, payment OFF — Stripe will need a flip later.)
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()", "autoplay=()", "camera=()", "display-capture=()",
      "encrypted-media=()", "fullscreen=(self)", "geolocation=()", "gyroscope=()",
      "magnetometer=()", "microphone=()", "midi=()", "payment=()",
      "picture-in-picture=()", "publickey-credentials-get=(self)", "usb=()", "xr-spatial-tracking=()",
    ].join(", "),
  },
  // Block crawlers from indexing API responses (HTML pages still index normally).
  // Per-route override-able: api routes set their own no-store cache.
];

const nextConfig: NextConfig = {
  // Standalone build = self-contained server bundle for the Docker image.
  output: "standalone",
  // Don't ship inline source maps to clients in prod.
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // API responses should never be cached by intermediaries.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
