// Dynamic /robots.txt — Next 16 route handler. Allow everything except the
// admin + API surface, where indexing is pointless. Sitemap reference helps
// Google + AI crawlers discover the marketing pages efficiently.

export const dynamic = "force-static";

export function GET() {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /admin/",
    "Disallow: /api/",
    "Disallow: /trash",
    "Disallow: /settings",
    "Disallow: /onboarding",
    "",
    "Sitemap: https://jobscout-hq.com/sitemap.xml",
    "",
  ].join("\n");

  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
