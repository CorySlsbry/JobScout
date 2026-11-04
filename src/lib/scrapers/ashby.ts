// Ashby Job Board API — unauthenticated, public.
//   GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true
// Returns array of full job postings with descriptions and (when allowed)
// compensation ranges.

import type { RawJob } from "../types";

type AshbyJob = {
  id: string;
  title: string;
  jobUrl: string;
  applyUrl?: string;
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  address?: { postalAddress?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } };
  employmentType?: string;
  team?: string;
  department?: string;
  location?: string;
  secondaryLocations?: Array<{ location: string }>;
  description?: string;           // HTML
  descriptionPlain?: string;
  compensation?: {
    summaryComponents?: Array<{ label?: string; compensationType?: string; minValue?: number; maxValue?: number; currencyCode?: string; interval?: string }>;
  };
};

type AshbyResp = { jobs?: AshbyJob[]; apiVersion?: string };

const BASE = "https://api.ashbyhq.com/posting-api/job-board";

export async function scrapeAshby(slug: string, opts: { matchTerms?: string[] } = {}): Promise<RawJob[]> {
  const url = `${BASE}/${encodeURIComponent(slug)}?includeCompensation=true`;

  let resp: Response;
  try {
    resp = await fetch(url, { next: { revalidate: 1800 } });
  } catch (e) {
    console.error(`[ashby:${slug}] fetch failed`, e);
    return [];
  }
  if (!resp.ok) {
    if (resp.status !== 404) console.error(`[ashby:${slug}] HTTP ${resp.status}`);
    return [];
  }

  let data: AshbyResp;
  try { data = await resp.json() as AshbyResp; }
  catch { return []; }

  const jobs = data.jobs ?? [];
  const terms = (opts.matchTerms ?? []).map((t) => t.toLowerCase());

  return jobs
    .filter((j) => j.isListed !== false)
    .filter((j) => {
      if (!terms.length) return true;
      const hay = `${j.title} ${j.team ?? ""} ${j.department ?? ""} ${j.descriptionPlain ?? ""}`.toLowerCase();
      return terms.some((t) => hay.includes(t));
    })
    .map((j): RawJob => {
      const comp = extractComp(j);
      return {
        source: "ashby",
        source_id: j.id,
        source_url: j.jobUrl ?? j.applyUrl ?? `${BASE}/${slug}/${j.id}`,
        title: j.title,
        company: prettifyCompany(slug),
        company_url: null,
        location: j.location ?? j.secondaryLocations?.[0]?.location ?? null,
        is_remote: !!j.isRemote || /remote/i.test(j.location ?? ""),
        remote_kind: j.isRemote ? "remote" : classifyRemote(j.location ?? null),
        salary_min: comp.min,
        salary_max: comp.max,
        salary_period: comp.period,
        description: j.descriptionPlain ?? stripHtml(j.description ?? ""),
        description_html: j.description ?? null,
        posted_at: j.publishedAt ?? null,
        raw: j,
      };
    });
}

function extractComp(j: AshbyJob): { min: number | null; max: number | null; period: "year" | "month" | "hour" } {
  const c = j.compensation?.summaryComponents?.[0];
  if (!c) return { min: null, max: null, period: "year" };
  const period: "year" | "month" | "hour" =
    c.interval === "1 HOUR" ? "hour" :
    c.interval === "1 MONTH" ? "month" : "year";
  return { min: c.minValue ?? null, max: c.maxValue ?? null, period };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function classifyRemote(loc: string | null): "remote" | "hybrid" | "onsite" | null {
  if (!loc) return null;
  if (/remote/i.test(loc) && /hybrid/i.test(loc)) return "hybrid";
  if (/remote/i.test(loc)) return "remote";
  if (/hybrid/i.test(loc)) return "hybrid";
  return "onsite";
}

function prettifyCompany(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
