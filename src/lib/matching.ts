// Pure scoring logic — easy to unit-test, no IO.
// Score 0-100. Above 70 = high match (push notification trigger).
//
// Multi-tenant: every signal pulls from the user's profile (target locations,
// salary floor, excluded keywords/companies). The ONLY non-profile-driven bias
// is the Utah-region fallback below, which is intentional — when no
// target_locations are set we default to Cory's geographic preferences (the
// founder's profile is the seed). Users who set their own target_locations
// see THEIR locations boosted, not Cory's.

import type { Profile, RawJob } from './types';

const SLC_TERMS = ['salt lake', 'slc', 'south jordan', 'sandy', 'draper', 'lehi'];
const UTAH_COUNTY_TERMS = ['utah county', 'provo', 'orem', 'lehi', 'pleasant grove', 'american fork', 'spanish fork'];

export const DEFAULT_KEYWORDS = [
  // automation / orchestration
  'automation', 'workflow', 'integration', 'orchestration', 'pipeline',
  'n8n', 'zapier', 'make.com', 'integromat', 'tray.io', 'workato',
  'gohighlevel', 'ghl', 'apollo',
  // ai tooling
  'claude', 'anthropic', 'openai', 'gpt', 'llm', 'agent', 'agentic', 'mcp',
  'prompt engineering', 'rag', 'retrieval',
  // backend / web
  'typescript', 'javascript', 'node.js', 'node', 'react', 'next.js', 'next',
  'tailwind', 'supabase', 'postgres', 'rest', 'json', 'api', 'webhook', 'oauth',
  'graphql', 'serverless', 'edge function', 'vercel', 'netlify',
  // architect / customer-facing
  'solutions architect', 'solutions engineer', 'integration engineer',
  'automation engineer', 'workflow engineer', 'forward deployed',
  'technical account', 'customer engineer', 'developer experience',
  'platform engineer', 'devops', 'sre',
  // domain
  'ev', 'electric vehicle', 'tesla', 'rivian', 'high voltage', 'can bus',
];

export type MatchResult = {
  score: number;          // 0-100
  reasons: string[];      // human-readable
  isExcluded: boolean;    // hits excluded list
  isStGeorgeMatch: boolean;
  meetsSalaryFloor: boolean;
};

export function scoreJob(job: RawJob, profile: Profile): MatchResult {
  const reasons: string[] = [];
  let score = 0;

  const haystack = [job.title, job.company, job.location, job.description ?? '']
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Hard exclusions first — banned company (exact-ish, case-insensitive).
  const companyLow = (job.company ?? '').toLowerCase().trim();
  const bannedCompanies = profile.excluded_companies ?? [];
  const bannedCompany = bannedCompanies.find((c) => {
    const cLow = c.toLowerCase().trim();
    if (!cLow || !companyLow) return false;
    // Match on whole-word containment so "540" doesn't ban "Acme 540 Industries" by accident.
    return companyLow === cLow || companyLow.startsWith(cLow + ' ') || companyLow.endsWith(' ' + cLow);
  });
  if (bannedCompany) {
    return {
      score: 0,
      reasons: [`Banned company: "${bannedCompany}"`],
      isExcluded: true,
      isStGeorgeMatch: false,
      meetsSalaryFloor: false,
    };
  }

  // Hard exclusions: keyword in title/company/location/description.
  const excluded = profile.excluded_keywords.find((kw) => kw && haystack.includes(kw.toLowerCase()));
  if (excluded) {
    return {
      score: 0,
      reasons: [`Excluded: matched "${excluded}"`],
      isExcluded: true,
      isStGeorgeMatch: false,
      meetsSalaryFloor: false,
    };
  }

  // Keyword matches (max 40 pts).
  const keywords = profile.resume_keywords.length ? profile.resume_keywords : DEFAULT_KEYWORDS;
  const hits = new Set<string>();
  for (const kw of keywords) {
    if (kw && haystack.includes(kw.toLowerCase())) hits.add(kw);
  }
  const keywordPts = Math.min(40, hits.size * 4);
  score += keywordPts;
  if (hits.size) reasons.push(`${hits.size} keyword hits: ${[...hits].slice(0, 5).join(', ')}${hits.size > 5 ? '…' : ''}`);

  // Title bonus — strong signal (max 20 pts).
  const titleLow = job.title.toLowerCase();
  const titleSignals = [
    'automation', 'integration', 'workflow', 'solutions architect',
    'solutions engineer', 'forward deployed', 'platform engineer',
  ];
  const titleHit = titleSignals.find((t) => titleLow.includes(t));
  if (titleHit) {
    score += 20;
    reasons.push(`Title signals "${titleHit}"`);
  }

  // Location / remote (max 25 pts).
  let locPts = 0;
  let isStGeorgeMatch = false;
  const loc = (job.location ?? '').toLowerCase();

  // Per-user target locations: lower-case the strings the user typed.
  // Empty list → NO city bonus (was leaking the founder's St George targets to
  // every new user). Remote jobs still get the full +25 below regardless.
  const userTargets = (profile.target_locations ?? [])
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean);
  const primaryMatch = userTargets.length > 0 ? userTargets.find((t) => loc.includes(t)) : undefined;

  if (job.is_remote || job.remote_kind === 'remote') {
    locPts = 25;
    reasons.push('Fully remote');
  } else if (primaryMatch) {
    locPts = 25;
    // Preserve the legacy flag name (isStGeorgeMatch) for caller compatibility — it
    // now means "primary-target geo match" regardless of which user we're scoring.
    isStGeorgeMatch = true;
    reasons.push(`Primary target: ${primaryMatch}`);
  } else if (job.remote_kind === 'hybrid' && profile.remote_pref !== 'remote_only') {
    locPts = 15;
    reasons.push('Hybrid');
  } else if (UTAH_COUNTY_TERMS.some((t) => loc.includes(t))) {
    locPts = profile.remote_pref === 'remote_only' ? 0 : 12;
    if (locPts) reasons.push('Utah County');
  } else if (SLC_TERMS.some((t) => loc.includes(t))) {
    locPts = profile.remote_pref === 'remote_only' ? 0 : 10;
    if (locPts) reasons.push('Salt Lake area');
  } else {
    // Out of target areas — only ok if remote.
    if (profile.remote_pref === 'remote_only') {
      return {
        score: 0,
        reasons: ['Out of target locations and not remote'],
        isExcluded: true,
        isStGeorgeMatch: false,
        meetsSalaryFloor: false,
      };
    }
  }
  score += locPts;

  // Salary (max 15 pts).
  const annualMax = annualize(job.salary_max, job.salary_period);
  const annualMin = annualize(job.salary_min, job.salary_period);
  const meetsFloor = (annualMax ?? annualMin ?? 0) >= profile.salary_floor;
  if (meetsFloor) {
    score += 15;
    reasons.push(`Salary ≥ $${(profile.salary_floor / 1000).toFixed(0)}k`);
  } else if (annualMin || annualMax) {
    reasons.push(`Salary below floor (${formatRange(annualMin, annualMax)})`);
  } else {
    score += 5; // neutral — undisclosed
  }

  return {
    score: Math.min(100, Math.round(score)),
    reasons,
    isExcluded: false,
    isStGeorgeMatch,
    meetsSalaryFloor: meetsFloor,
  };
}

function annualize(amount: number | null, period: 'year' | 'month' | 'hour'): number | null {
  if (amount == null) return null;
  switch (period) {
    case 'year':  return amount;
    case 'month': return amount * 12;
    case 'hour':  return amount * 2080;
  }
}

function formatRange(min: number | null, max: number | null): string {
  if (min && max) return `$${k(min)}–${k(max)}`;
  if (max) return `up to $${k(max)}`;
  if (min) return `from $${k(min)}`;
  return 'undisclosed';
}

const k = (n: number) => `${(n / 1000).toFixed(0)}k`;

// Convenience for the feed view.
export function shouldNotify(score: number, salaryFloorMet: boolean, isStGeorge: boolean): boolean {
  if (isStGeorge && score >= 60) return true;
  if (salaryFloorMet && score >= 75) return true;
  return false;
}

// Parses the minimum required years-of-experience from a job description.
// Returns null if no clear signal. Conservative: scan only the first 4000 chars
// (the requirements section nearly always lives there), match the canonical
// "X+ years" / "X years of experience" / "X-Y years" patterns, and take the
// LOWEST value found (so "5+ years preferred, 3+ required" reports as 3).
export function extractRequiredYears(description: string | null | undefined): number | null {
  if (!description) return null;
  const text = description.slice(0, 4000).toLowerCase();
  // Patterns: "5+ years", "5 years", "5-7 years", "minimum of 5 years",
  // "at least 5 years", "five years" (worded — skip for now, low value).
  const regexes = [
    /\b(\d{1,2})\s*\+\s*years?\b/g,           // "5+ years"
    /\b(\d{1,2})\s*-\s*\d{1,2}\s*years?\b/g,  // "5-7 years" → take low end
    /\b(?:minimum|at least|min\.)\s+(?:of\s+)?(\d{1,2})\s*\+?\s*years?\b/g,
    /\b(\d{1,2})\s*years?\s+(?:of\s+)?(?:relevant\s+|professional\s+|industry\s+)?experience\b/g,
  ];
  const values: number[] = [];
  for (const re of regexes) {
    for (const m of text.matchAll(re)) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n >= 1 && n <= 30) values.push(n);
    }
  }
  if (values.length === 0) return null;
  // Take the LOWEST value — when a JD says "5+ preferred, 3+ required", we want the floor.
  return Math.min(...values);
}
