// Mock scraper — emits a small batch of plausible jobs so the sync flow is testable
// without API keys. Toggle via JOBSCOUT_USE_MOCKS=1.

import type { RawJob } from "../types";

export async function mockSearch(): Promise<RawJob[]> {
  const now = Date.now();
  return [
    {
      source: "linkedin",
      source_id: `mock-${now}-1`,
      source_url: "https://www.linkedin.com/jobs/view/mock-1",
      title: "Senior Automation Engineer (Remote)",
      company: "Latitude AI",
      company_url: null,
      location: "Remote",
      is_remote: true,
      remote_kind: "remote",
      salary_min: 170000,
      salary_max: 220000,
      salary_period: "year",
      description: "Build n8n / Claude integrations. Heavy TypeScript / Node.js / Supabase. MCP a plus.",
      description_html: null,
      posted_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      raw: null,
    },
    {
      source: "indeed",
      source_id: `mock-${now}-2`,
      source_url: "https://www.indeed.com/viewjob?jk=mock-2",
      title: "Solutions Architect — St George",
      company: "Canyon CRM",
      company_url: null,
      location: "Saint George, UT (Hybrid)",
      is_remote: false,
      remote_kind: "hybrid",
      salary_min: 160000,
      salary_max: 200000,
      salary_period: "year",
      description: "Customer-facing automation architect. GHL, n8n, Apollo, Supabase. Bonus: EV/automotive systems background.",
      description_html: null,
      posted_at: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
      raw: null,
    },
  ];
}
