// Lever Postings API — unauthenticated, public.
//   GET https://api.lever.co/v0/postings/{slug}?mode=json
// Returns array of full postings with descriptions and salary (where set).

import type { RawJob } from "../types";

type LeverJob = {
  id: string;
  text: string;                       // job title
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;                 // ms
  updatedAt?: number;
  categories?: { team?: string; department?: string; location?: string; commitment?: string; allLocations?: string[] };
  workplaceType?: "remote" | "hybrid" | "on-site" | "unspecified";
  description?: string;               // HTML
  descriptionPlain?: string;
  lists?: Array<{ text: string; content: string }>;
  additional?: string;                // HTML
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
};

const BASE = "https://api.lever.co/v0/postings";

export async function scrapeLever(slug: string, opts: { matchTerms?: string[] } = {}): Promise<RawJob[]> {
  const url = `${BASE}/${encodeURIComponent(slug)}?mode=json`;

  let resp: Response;
  try {
    resp = await fetch(url, { next: { revalidate: 1800 } });
  } catch (e) {
    console.error(`[lever:${slug}] fetch failed`, e);
    return [];
  }
  if (!resp.ok) {
    if (resp.status !== 404) console.error(`[lever:${slug}] HTTP ${resp.status}`);
    return [];
  }

  let data: LeverJob[];
  try { data = await resp.json() as LeverJob[]; }
  catch { return []; }
  if (!Array.isArray(data)) return [];

  const terms = (opts.matchTerms ?? []).map((t) => t.toLowerCase());

  return data
    .filter((j) => {
      if (!terms.length) return true;
      const hay = `${j.text} ${j.categories?.team ?? ""} ${j.categories?.department ?? ""} ${j.descriptionPlain ?? ""}`.toLowerCase();
      return terms.some((t) => hay.includes(t));
    })
    .map((j): RawJob => {
      const period: "year" | "month" | "hour" =
        j.salaryRange?.interval === "per-hour-salary" ? "hour" :
        j.salaryRange?.interval === "per-month-salary" ? "month" : "year";
      return {
        source: "lever",
        source_id: j.id,
        source_url: j.hostedUrl,
        title: j.text,
        company: prettifyCompany(slug),
        company_url: null,
        location: j.categories?.location ?? null,
        is_remote: j.workplaceType === "remote" || /remote/i.test(j.categories?.location ?? ""),
        remote_kind:
          j.workplaceType === "remote" ? "remote" :
          j.workplaceType === "hybrid" ? "hybrid" :
          j.workplaceType === "on-site" ? "onsite" :
          classifyRemote(j.categories?.location ?? null),
        salary_min: j.salaryRange?.min ?? null,
        salary_max: j.salaryRange?.max ?? null,
        salary_period: period,
        description: j.descriptionPlain ?? stripHtml(j.description ?? ""),
        description_html: j.description ?? null,
        posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
        raw: j,
      };
    });
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
