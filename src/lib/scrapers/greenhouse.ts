// Greenhouse Job Boards API — unauthenticated, public.
//   GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
// Returns ALL active jobs for a company in one shot, with full descriptions
// when content=true. We filter to matches against the search terms client-side.

import type { RawJob } from "../types";

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  internal_job_id?: number;
  location?: { name?: string };
  metadata?: Array<{ name: string; value: unknown }>;
  content?: string;       // HTML, escaped
  updated_at?: string;
  departments?: Array<{ id: number; name: string }>;
  offices?: Array<{ id: number; name: string; location?: string }>;
};

type GreenhouseResp = { jobs?: GreenhouseJob[]; meta?: { total: number } };

const BASE = "https://boards-api.greenhouse.io/v1/boards";

export async function scrapeGreenhouse(slug: string, opts: { matchTerms?: string[] } = {}): Promise<RawJob[]> {
  const url = `${BASE}/${encodeURIComponent(slug)}/jobs?content=true`;

  let resp: Response;
  try {
    resp = await fetch(url, { next: { revalidate: 1800 } });
  } catch (e) {
    console.error(`[greenhouse:${slug}] fetch failed`, e);
    return [];
  }
  if (!resp.ok) {
    if (resp.status !== 404) console.error(`[greenhouse:${slug}] HTTP ${resp.status}`);
    return [];
  }

  let data: GreenhouseResp;
  try { data = await resp.json() as GreenhouseResp; }
  catch { return []; }

  const jobs = data.jobs ?? [];
  const terms = (opts.matchTerms ?? []).map((t) => t.toLowerCase());

  return jobs
    .filter((j) => {
      if (!terms.length) return true;
      const hay = `${j.title} ${j.departments?.map((d) => d.name).join(" ") ?? ""} ${stripHtml(j.content ?? "")}`.toLowerCase();
      return terms.some((t) => hay.includes(t));
    })
    .map((j): RawJob => ({
      source: "greenhouse",
      source_id: String(j.id),
      source_url: j.absolute_url,
      title: j.title,
      company: prettifyCompany(slug),
      company_url: null,
      location: j.location?.name ?? j.offices?.[0]?.name ?? null,
      is_remote: /remote/i.test(j.location?.name ?? "") || /remote/i.test(j.offices?.[0]?.name ?? ""),
      remote_kind: classifyRemote(j.location?.name ?? j.offices?.[0]?.name ?? null),
      salary_min: null,
      salary_max: null,
      salary_period: "year",
      description: stripHtml(j.content ?? ""),
      description_html: j.content ?? null,
      posted_at: j.updated_at ?? null,
      raw: j,
    }));
}

function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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
