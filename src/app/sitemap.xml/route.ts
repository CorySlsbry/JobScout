// Dynamic /sitemap.xml — lists the marketing surface for AI + traditional crawlers.
//
// We DON'T list authenticated pages (/feed, /settings, /admin, etc.) — those
// 30x to /signin for non-authed visitors so a crawler would just see a
// redirect. We also explicitly include the public trust pages (/security,
// /status) so they land in the AI Overview citation pool.

export const dynamic = "force-static";

const PAGES: Array<{ path: string; priority: number; changefreq: string }> = [
  { path: "/",          priority: 1.0, changefreq: "weekly"  },
  { path: "/pricing",   priority: 0.9, changefreq: "weekly"  },
  { path: "/signup",    priority: 0.8, changefreq: "monthly" },
  { path: "/signin",    priority: 0.4, changefreq: "yearly"  },
  { path: "/terms",     priority: 0.3, changefreq: "yearly"  },
  { path: "/privacy",   priority: 0.3, changefreq: "yearly"  },
  { path: "/security",  priority: 0.4, changefreq: "monthly" },
  { path: "/status",    priority: 0.3, changefreq: "daily"   },
];

const BASE = "https://jobscout-hq.com";

export function GET() {
  const lastmod = new Date().toISOString();
  const urls = PAGES.map((p) => [
    "  <url>",
    `    <loc>${BASE}${p.path}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${p.changefreq}</changefreq>`,
    `    <priority>${p.priority.toFixed(1)}</priority>`,
    "  </url>",
  ].join("\n")).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
