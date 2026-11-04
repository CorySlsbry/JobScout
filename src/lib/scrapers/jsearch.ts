// JSearch (RapidAPI) — aggregates LinkedIn, Indeed, ZipRecruiter, Glassdoor, etc.
// Sign up at https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch and put the key in
// JSEARCH_RAPIDAPI_KEY. Free tier: 200 requests/month.

import type { RawJob, JobSource } from "../types";

const HOST = "jsearch.p.rapidapi.com";
const ENDPOINT = `https://${HOST}/search`;

type JSearchHit = {
  job_id: string;
  job_title: string;
  employer_name?: string;
  employer_website?: string;
  job_publisher?: string;
  job_employment_type?: string;
  job_apply_link?: string;
  job_description?: string;
  job_is_remote?: boolean;
  job_posted_at_datetime_utc?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_min_salary?: number;
  job_max_salary?: number;
  job_salary_period?: "YEAR" | "MONTH" | "HOUR";
};

type JSearchResp = { data?: JSearchHit[]; status?: string };

export async function searchJSearch(query: string, location: string): Promise<RawJob[]> {
  const key = process.env.JSEARCH_RAPIDAPI_KEY;
  if (!key) return [];

  const url = new URL(ENDPOINT);
  url.searchParams.set("query", `${query} in ${location}`);
  url.searchParams.set("page", "1");
  url.searchParams.set("num_pages", "1");
  url.searchParams.set("date_posted", "week");
  if (/remote/i.test(location)) url.searchParams.set("remote_jobs_only", "true");

  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": HOST,
      },
      next: { revalidate: 600 },
    });
  } catch (e) {
    console.error("[jsearch] fetch failed:", e);
    return [];
  }

  if (!resp.ok) {
    console.error("[jsearch] non-OK:", resp.status, await resp.text().catch(() => ""));
    return [];
  }

  const json: JSearchResp = await resp.json();
  return (json.data ?? []).map(toRaw).filter((j): j is RawJob => !!j);
}

function toRaw(hit: JSearchHit): RawJob | null {
  if (!hit.job_id || !hit.job_title) return null;
  const source = inferSource(hit.job_publisher);
  const period =
    hit.job_salary_period === "MONTH" ? "month" :
    hit.job_salary_period === "HOUR"  ? "hour"  :
    "year";
  return {
    source,
    source_id: hit.job_id,
    source_url: hit.job_apply_link ?? "",
    title: hit.job_title,
    company: hit.employer_name ?? null,
    company_url: hit.employer_website ?? null,
    location: [hit.job_city, hit.job_state].filter(Boolean).join(", ") || null,
    is_remote: !!hit.job_is_remote,
    remote_kind: hit.job_is_remote ? "remote" : null,
    salary_min: hit.job_min_salary ?? null,
    salary_max: hit.job_max_salary ?? null,
    salary_period: period,
    description: hit.job_description ?? null,
    description_html: null,
    posted_at: hit.job_posted_at_datetime_utc ?? null,
    raw: hit,
  };
}

function inferSource(publisher: string | undefined): JobSource {
  const p = (publisher ?? "").toLowerCase();
  if (p.includes("linkedin")) return "linkedin";
  if (p.includes("indeed")) return "indeed";
  if (p.includes("ziprecruiter") || p.includes("zip recruiter")) return "ziprecruiter";
  if (p.includes("google")) return "google_jobs";
  return "jsearch";
}
