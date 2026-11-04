// In-memory seed data + store. Used when Firestore isn't configured so the
// app is runnable on first boot.

import type { Application, Assessment, InterviewStory, Job, Profile, RawJob, UpworkLead } from './types';
import { DEFAULT_KEYWORDS, scoreJob } from './matching';

// Cory's base resume — used as the AI-tailor source on first boot until the
// user pastes their own. Lifted from resume/Cory_Salisbury_Automation_Engineer.md.
const DEFAULT_BASE_RESUME = `# Cory S. Salisbury
**Automation Engineer | AI Workflow Architect | EV Systems Specialist**
Orem, UT (open to remote, relocating to St George, UT) · (801) 245-0511 · cory.salisbury@gmail.com

## Professional Summary
Automation engineer and full-stack tinkerer with 7+ years of complex-systems experience at Tesla, Rivian, and SpaceX, now operating an AI-augmented automation practice using Claude Code, n8n, GoHighLevel (GHL), Apollo, and Supabase. Builds end-to-end pipelines that ingest data, route work, generate content, and ship customer-facing apps — including a personal "Brain" knowledge system (40+ wiki pages, custom skills, lint/search tooling) that powers reusable AI workflows across client projects. Equally comfortable debugging a CAN bus on a Model S and an OAuth flow on a Vercel deployment.

## AI Automation & Tooling
- Claude Code orchestration: custom skills, MCP connectors, plugins, multi-agent pipelines.
- Personal Brain knowledge base: 40+ concept/entity/source pages, append-only log, lint + term-frequency search scripts, mode-aware skill routing.
- Workflow stacks shipped: n8n, GHL workflows + custom fields, Apollo prospect → enrich → sequence pipelines, Stripe live billing, Supabase per-schema multi-tenancy.
- Apps shipped: consumer PWAs (MacroHit, ScanZen, DuoWealth, CalmKids, Memori), CRM/ad hubs (Jarvis Ad Hub with Imagen 4 Ultra + Claude generation), vertical CFO dashboards (BuilderCFO, PracticeCFO, SellerCFO).
- Languages & infra: TypeScript / JavaScript, Node.js, Next.js (App Router), React, Tailwind, Supabase / Postgres, Linux / Ubuntu, Git / GitHub, REST/JSON APIs, web scraping, Playwright.

## Selected Automation Projects (2024–2026)
- Jarvis Ad Hub — multi-platform ad creation + publishing app replacing a marketing team and Buffer subscription.
- 4-app vertical infra — DuoWealth / ScanZen Pro / CalmKids / Memori AI on shared Supabase, Stripe LIVE.
- BuilderCFO + verticals — diagnostic, financial-statement, and prospecting agents for contractor / CPA / real-estate niches.
- Brain knowledge system — Karpathy-style personal wiki with custom Python lint + search.

## Professional Experience

### Sr. Service Technician — Tesla, SLC & Pleasant Grove, UT
*2016–2018 · 2018–2020 · 2022–Present*
- Diagnose complex high-voltage, low-voltage, and CAN/LIN integrations using Tesla internal tools (Warp, Periscope, Garage, Carlogs, Teleforce 2).
- Run virtual / remote diagnosis sessions for field cars; reduced turnaround on hard-to-repro intermittents.
- Built training program in CAN/LIN and software diagnostics that lifted team productivity ~15%.
- 4 of 5 Tesla Masteries: DAS, Thermal, Low Voltage, High Voltage.

### Sr. Field Service Technician — Rivian, SLC, UT
*2021–2022*
- Stood up high-voltage diagnostics for R1T launch and Amazon delivery van fleet; remote support to recover EOL vehicles.
- Partnered with engineering on software-assisted troubleshooting for novel EV failure modes.

### Launch Technician — SpaceX, Cape Canaveral, FL
*April 2018 – October 2018*
- Crewed Dragon mission prep: integrated wiring harnesses, RTDs, valves, transducers from schematics.
- Built Tier-2 wiring harnesses and DAQ instrumentation that interfaced directly with launch systems.

## Education & Certifications
- University of Utah — Full Stack Web Development Bootcamp (2021)
- Weber State University — AAS, Chrysler CAP Program (2000–2002)
- ASE Master Certified — A1–A8 + L3 EV
- Tesla Master Technician — DAS, Thermal, Low Voltage, High Voltage

## Technical Skills
**Automation / AI:** Claude Code, MCP, n8n, GoHighLevel, Apollo, Zapier, custom skill authoring, prompt engineering, Imagen 4 Ultra, agentic pipelines
**Web / App:** TypeScript, JavaScript, Node.js, React, Next.js (App Router), Tailwind, shadcn, Remotion, framer-motion
**Data / Backend:** Supabase, Postgres, MySQL, REST/JSON APIs, web scraping (Playwright), Stripe live billing
**Systems / Diagnostics:** Linux/Ubuntu, Git/GitHub, CAN/LIN bus, oscilloscope, multimeter, electrical theory, complex-system debugging
**Soft skills:** Technical writing, training, async/remote-first, customer-facing problem solving`;

const DEFAULT_PROFILE: Profile = {
  id: 'local-profile',
  user_id: 'me', // overwritten with Firebase UID once auth lands
  full_name: 'Cory S. Salisbury',
  email: 'cory.salisbury@gmail.com',
  phone: '(801) 245-0511',
  resume_md: DEFAULT_BASE_RESUME,
  resume_keywords: DEFAULT_KEYWORDS,
  salary_floor: 150000,
  remote_pref: 'remote_first',
  target_locations: ['St George, UT', 'Salt Lake City, UT', 'Utah County, UT', 'Remote'],
  excluded_keywords: [
    'automotive technician', 'field service technician', 'auto body', 'oil change',
    // Filter out roles that are explicitly geography-restricted away from the US.
    'eu only', 'emea only', 'europe only', 'eu-based', 'eu based', 'must be based in europe',
    'uk only', 'based in the uk', 'us citizen only',
  ],
  excluded_companies: [
    // Per-task freelance / data-labeling outfits (looks like remote tech but is gig work)
    'Mindrift', 'Outlier AI', 'Outlier', 'Scale AI', 'Surge AI', 'Remotasks', 'Toloka',
    'DataAnnotation', 'DataAnnotation.tech', 'Invisible Technologies',
    // Generic freelance marketplaces
    'Toptal', 'Upwork', 'Contra', 'Fiverr', 'Andela', 'Turing', 'Crossover',
    // Recruitment agencies / aggregators showing as employers
    'Hirequill', 'Placements24', '540', 'Robert Half', 'Adecco', 'Aerotek',
    'Insight Global', 'Jobot', 'CyberCoders', 'Motion Recruitment',
    'Dice', 'Jobs via Dice', 'Jobs via eFinancialCareers', 'Jobs via Indeed Hire',
  ],
  push_subscription: null,
  digest_frequency: 'daily',
  digest_min_score: 70,
  digest_last_sent_at: null,
  digest_unsubscribe_token: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const SEED_RAW_JOBS: RawJob[] = [
  {
    source: 'linkedin',
    source_id: 'li-1001',
    source_url: 'https://www.linkedin.com/jobs/view/example-1001',
    title: 'Solutions Architect — Workflow Automation',
    company: 'Vellum AI',
    company_url: 'https://vellum.ai',
    location: 'Remote (US)',
    is_remote: true,
    remote_kind: 'remote',
    salary_min: 165000,
    salary_max: 215000,
    salary_period: 'year',
    description:
      'You will design and ship n8n / workflow integrations for enterprise customers. ' +
      'Strong TypeScript / Node.js, REST/JSON, OAuth, webhook expertise. ' +
      'Customer-facing technical role. Bonus: Claude / LLM experience, MCP, Supabase.',
    description_html: null,
    posted_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    raw: null,
  },
  {
    source: 'indeed',
    source_id: 'in-2002',
    source_url: 'https://www.indeed.com/viewjob?jk=example-2002',
    title: 'Automation Engineer (Remote)',
    company: 'Stack AI',
    company_url: null,
    location: 'Remote',
    is_remote: true,
    remote_kind: 'remote',
    salary_min: 150000,
    salary_max: 190000,
    salary_period: 'year',
    description:
      'Build agentic automation pipelines with TypeScript and Python. ' +
      'Experience with Zapier, n8n, GHL, or Make a strong plus. ' +
      'You will work directly with founding team on integration design.',
    description_html: null,
    posted_at: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    raw: null,
  },
  {
    source: 'ziprecruiter',
    source_id: 'zr-3003',
    source_url: 'https://www.ziprecruiter.com/jobs/example-3003',
    title: 'Forward Deployed Engineer',
    company: 'Decagon',
    company_url: null,
    location: 'St George, UT (Remote-friendly)',
    is_remote: true,
    remote_kind: 'remote',
    salary_min: 175000,
    salary_max: 240000,
    salary_period: 'year',
    description:
      'Embed with customers to deliver AI-driven automation. Heavy customer-facing work. ' +
      'Looking for deep system thinkers — backgrounds in EVs, robotics, complex hardware welcome.',
    description_html: null,
    posted_at: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    raw: null,
  },
  {
    source: 'ksl',
    source_id: 'ksl-4004',
    source_url: 'https://jobs.ksl.com/listing/example-4004',
    title: 'Integration Engineer — GoHighLevel',
    company: 'Local SaaS Co.',
    company_url: null,
    location: 'Lehi, UT (Hybrid)',
    is_remote: false,
    remote_kind: 'hybrid',
    salary_min: 130000,
    salary_max: 165000,
    salary_period: 'year',
    description:
      'Hands-on GHL integration work — workflows, custom fields, webhooks. ' +
      'TypeScript / Node.js / Supabase preferred. Hybrid 2 days/week in Lehi.',
    description_html: null,
    posted_at: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
    raw: null,
  },
  {
    source: 'linkedin',
    source_id: 'li-1005',
    source_url: 'https://www.linkedin.com/jobs/view/example-1005',
    title: 'Senior Automotive Technician — EV',
    company: 'Acme Auto',
    company_url: null,
    location: 'Salt Lake City, UT',
    is_remote: false,
    remote_kind: 'onsite',
    salary_min: 70000,
    salary_max: 95000,
    salary_period: 'year',
    description: 'Diagnose EV systems, CAN bus. Field service work.',
    description_html: null,
    posted_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    raw: null,
  },
  {
    source: 'jsearch',
    source_id: 'js-6006',
    source_url: 'https://example.com/jobs/6006',
    title: 'Workflow Engineer — Enterprise Automation',
    company: 'Tray.io',
    company_url: null,
    location: 'St George, UT',
    is_remote: false,
    remote_kind: 'hybrid',
    salary_min: 155000,
    salary_max: 200000,
    salary_period: 'year',
    description:
      'Design enterprise automation workflows. Tray.io / Zapier / n8n / Workato experience welcome. ' +
      'TypeScript, REST/JSON, webhooks. Hybrid in St George office (2x/wk).',
    description_html: null,
    posted_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    raw: null,
  },
];

// In-memory store (process-local — fine for single-user dev).
type Store = {
  profile: Profile;
  jobs: Job[];
  applications: Application[];
  stories?: InterviewStory[];
  upworkLeads?: UpworkLead[];
  assessments?: Assessment[];
};

const globalStore = globalThis as unknown as { __jobScoutStore?: Store };

function buildJob(raw: RawJob, profile: Profile): Job {
  const m = scoreJob(raw, profile);
  return {
    ...raw,
    id: cryptoRandom(),
    discovered_at: new Date().toISOString(),
    match_score: m.score,
    match_reasons: m.reasons,
    is_excluded: m.isExcluded,
  };
}

function cryptoRandom(): string {
  // Stable enough for in-memory ids.
  return 'job_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function getStore(): Store {
  if (!globalStore.__jobScoutStore) {
    const profile = { ...DEFAULT_PROFILE };
    globalStore.__jobScoutStore = {
      profile,
      jobs: SEED_RAW_JOBS.map((r) => buildJob(r, profile)),
      applications: [],
    };
  }
  return globalStore.__jobScoutStore;
}

export function rescoreAll(): void {
  const store = getStore();
  store.jobs = store.jobs.map((j) => {
    const { id, discovered_at, match_score: _ms, match_reasons: _mr, is_excluded: _ix, ...raw } = j;
    void _ms; void _mr; void _ix;
    const m = scoreJob(raw, store.profile);
    return { ...j, match_score: m.score, match_reasons: m.reasons, is_excluded: m.isExcluded };
  });
}
