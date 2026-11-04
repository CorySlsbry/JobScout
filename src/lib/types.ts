// Domain types shared across the app.

export type RemoteKind = 'remote' | 'hybrid' | 'onsite';

export type JobSource =
  | 'linkedin'
  | 'indeed'
  | 'ziprecruiter'
  | 'ksl'
  | 'jsearch'
  | 'google_jobs'
  | 'greenhouse'
  | 'ashby'
  | 'lever'
  | 'other';

export type ApplicationStatus =
  | 'saved'
  | 'queued'
  | 'applied'
  | 'followed_up'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'dismissed';

export type RemotePref = 'remote_only' | 'remote_first' | 'hybrid_ok' | 'onsite_ok';

// Per-user role + plan. Used for admin gating + Stripe billing.
// 'free' = signed up, no payment, capped quotas.
// 'pro'  = $19/mo, unlimited core + Upwork extension + Gmail inbox watcher.
// 'boost' = $29/mo, everything in Pro + Comp Intelligence + Negotiation Playbook.
export type UserRole = 'admin' | 'user';
export type UserPlan = 'free' | 'pro' | 'boost';

// What Stripe says about the user's subscription. We mirror this to decide
// whether to gate features. 'active' and 'trialing' grant access; everything
// else falls back to free.
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'none';   // never had one

// Referral: every User gets a public refer_code (~6 chars) at creation. When
// they share `?ref=CODE` links, signups via that code stamp `referred_by_code`
// on the new user. The owner's `referral_count` increments. Once 2 referrals
// stay subscribed 30+ days the owner gets a 20% off Pro coupon applied (the
// applied-coupon step is currently MANUAL via Stripe Dashboard; auto-apply is
// a future iteration — search "TODO(referral coupon)" for the wire point).
export type ReferralFields = {
  refer_code: string;
  referred_by_code: string | null;
  referral_count: number;
};

export type User = {
  id: string;                       // Firebase Auth UID — doc id in `users` collection
  email: string;
  display_name: string | null;
  photo_url: string | null;
  role: UserRole;
  plan: UserPlan;                   // resolved tier — admin override OR derived from Stripe
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  subscription_current_period_end: string | null;   // ISO; tells us when to re-check Stripe
  // Onboarding gate — true once they've finished /onboarding (profile, resume, calibration).
  onboarded: boolean;
  // Referral fields — every user gets a refer_code at creation. See ReferralFields.
  refer_code: string;
  referred_by_code: string | null;
  referral_count: number;
  // ── Transactional email workflow stamps ──────────────────────────────
  // Set when the corresponding workflow has fired, so the cron sweep doesn't
  // re-send. All ISO timestamps; null = never sent.
  welcome_sent_at?: string | null;
  onboarding_nudge_sent_at?: string | null;
  upgrade_nudge_sent_at?: string | null;
  dunning_sent_at?: string | null;
  comeback_sent_at?: string | null;
  // MFA enabled in Firebase Auth — mirrored here for tier gating + display.
  // Source of truth lives in Firebase Auth; this is a cached flag.
  mfa_enabled?: boolean;
  mfa_enabled_at?: string | null;
  created_at: string;
  last_seen_at: string;
};

export type DigestFrequency = 'off' | 'daily' | 'weekly';

export type UpworkFilters = {
  hourly_only: boolean;          // skip fixed-price contracts
  no_time_tracker: boolean;      // skip jobs requiring Upwork's time tracker
  no_fixed_schedule: boolean;    // skip "must be online 9-5 EST" type jobs
  no_onsite: boolean;            // skip on-site/hybrid (rare on Upwork but possible)
  no_long_term: boolean;         // skip >3 month commitments
  min_hourly_rate: number;       // $/hr floor for hourly contracts
  min_fixed_budget: number;      // $ floor for fixed-price contracts
  max_proposals_already: number; // skip jobs that already have N+ bids
  exclude_keywords: string[];    // case-insensitive substring blacklist
  include_keywords: string[];    // JD must contain ≥1 of these (case-insensitive) — empty = no positive filter
};

export const DEFAULT_UPWORK_FILTERS: UpworkFilters = {
  hourly_only: false,
  no_time_tracker: true,
  no_fixed_schedule: true,
  no_onsite: true,
  no_long_term: false,
  min_hourly_rate: 50,
  min_fixed_budget: 500,
  max_proposals_already: 30,
  exclude_keywords: ['clock-in', 'clock in', 'time clock', 'mandatory hours', 'specific hours required', 'on-call', '9 to 5'],
  // Cory's target verticals — automation / web / app / API work. Keywords must
  // be substrings, so 'n8n' matches 'using n8n', 'API' matches 'REST API', etc.
  include_keywords: [
    'automation', 'automate', 'workflow', 'n8n', 'zapier', 'make.com', 'integromat',
    'integration', 'API', 'webhook', 'scraper', 'scraping', 'bot',
    'web app', 'webapp', 'website', 'landing page', 'next.js', 'nextjs', 'react', 'vue', 'svelte',
    'full-stack', 'fullstack', 'full stack', 'backend', 'frontend', 'node', 'typescript', 'javascript',
    'mobile app', 'pwa', 'progressive web',
    'crm', 'gohighlevel', 'ghl', 'hubspot', 'salesforce',
    'ai agent', 'llm', 'claude', 'gpt', 'openai', 'anthropic', 'chatbot',
    'firebase', 'supabase', 'postgres', 'mongodb',
    'saas', 'mvp', 'prototype',
  ],
};

export type ResumeKind = 'paste' | 'pdf' | 'docx' | 'md' | 'txt';

export type Resume = {
  id: string;
  user_id: string;        // 'me' for single-user fallback; Firebase UID once auth lands
  name: string;           // user-editable label, e.g. "Solutions Architect"
  content_md: string;     // resume body, always markdown after parsing
  source_filename: string | null;  // original upload file name (display only)
  source_kind: ResumeKind;
  is_active: boolean;     // exactly one active resume per user → mirrored to profile.resume_md
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  user_id: string;     // FK to User.id (= Firebase UID); 'me' for single-user fallback
  full_name: string;
  email: string;
  phone: string | null;
  resume_md: string | null;
  resume_keywords: string[];
  salary_floor: number;
  remote_pref: RemotePref;
  target_locations: string[];
  excluded_keywords: string[];
  excluded_companies: string[];   // exact (case-insensitive) match on job.company → score 0
  push_subscription: PushSubscriptionJSON | null;
  // Email digest prefs
  digest_frequency?: DigestFrequency;        // 'off' = never, default 'daily'
  digest_min_score?: number;                  // only include jobs ≥ this score (default 70)
  digest_last_sent_at?: string | null;
  digest_unsubscribe_token?: string | null;
  // Browser-extension auth (sha256 hash of the token; plaintext shown to user only at generation time)
  extension_token_hash?: string | null;
  extension_token_created_at?: string | null;
  // Upwork bidding filters (admin-only feature)
  upwork_filters?: UpworkFilters;
  // Gmail inbox watcher — OAuth refresh token + connection metadata. JobScout
  // polls this account for Upwork job-alert emails, scores them, pre-drafts
  // proposals. The refresh token is long-lived; access tokens are derived.
  gmail_refresh_token?: string | null;
  gmail_connected_email?: string | null;     // the address that authorized (should be cory.salisbury@gmail.com)
  gmail_connected_at?: string | null;
  upwork_inbox_last_run?: string | null;      // ISO timestamp of the last successful cron poll
  upwork_inbox_last_history_id?: string | null; // Gmail historyId checkpoint (future incremental sync)
  // Per-user Upwork RSS feeds — pasted from Upwork's saved-search RSS export.
  // The /api/cron/upwork-rss cron polls each URL hourly, scores new jobs via
  // Claude, drafts proposals, and stores them as UpworkLead docs. Works for
  // ANY Pro+ user without needing Gmail OAuth (the previous mechanism was
  // admin-only because it required Cory's connected Gmail).
  upwork_search_urls?: string[];
  upwork_rss_last_run?: string | null;
  // Per-user Upwork search KEYWORDS — the primary mechanism since Upwork
  // retired public RSS (the /ab/feed/jobs/rss endpoints now return 410 Gone).
  // The /api/cron/upwork-rss cron runs each keyword through an Apify Upwork
  // scraper (gio21/upwork-jobs-scraper) when APIFY_TOKEN is configured,
  // scores new jobs, and stores them as UpworkLead docs. Throttled per-user
  // via upwork_apify_last_run so the paid scrape fires a few times/day, not hourly.
  upwork_search_queries?: string[];
  upwork_apify_last_run?: string | null;
  // Richer context for the AI scorer — ported from santifer/career-ops design.
  // The resume tells the AI WHAT you've done; these tell it WHO you want to
  // become and what you want to AVOID. Without them every score is a flat
  // resume-match check; with them the AI can flag growth-misaligned roles,
  // red-flag JD language, and pre-empt the "why are you looking" question.
  career_story_md?: string | null;   // 200-400 words. The narrative arc + what you're optimizing for next.
  avoid_md?: string | null;          // Free-text "what would make me skip" (e.g. "no agencies", "no on-call rotations")
  growth_goals_md?: string | null;   // Where you're trying to go (e.g. "Applied AI Solutions Architect", "$200k+", "remote-first")
  // ── Live calibration controls (Aim) ──────────────────────────────────
  // The user can tell the scorer how to calibrate, plus list the concrete
  // job targets they're trying to LEVEL UP to (aspirational but reachable)
  // and STAY WITH (current-tier work that still pays). Both lists become
  // chips in the UI. The scorer prompt uses them to:
  //   • boost jobs that match Level Up or Stay With anchors
  //   • skip super-high-reach roles outside both bands
  //   • skip low-grade legacy roles the user is leaving behind
  tuning_prompt_md?: string | null;        // free-text live calibration prompt
  level_up_targets?: string[];              // aspirational anchors (stretch but reachable)
  stay_with_targets?: string[];             // current-tier anchors that still pay well
  // ── Per-user power filters ───────────────────────────────────────────
  // Hard-delete: job ids the user has explicitly removed from their feed.
  // Render-only filter applied in listJobs; the job doc stays in the shared pool.
  hidden_job_ids?: string[];
  // Experience-level filter — user states their YoE, we filter out jobs requiring more.
  years_experience?: number | null;         // user's actual years
  max_required_years?: number | null;       // hide jobs requiring more than this
  // "Job description must mention at least one of these" — opposite of excluded_keywords.
  keyword_include?: string[];
  // Per-user title targeting — used by the scorer + feed filter.
  target_titles?: string[];
  // Per-user board toggle. Empty/undefined = all boards.
  enabled_sources?: JobSource[];
  // URL substring blacklist — kills scraper spam like lensa.com aggregator URLs.
  blacklist_url_patterns?: string[];
  // Quiet hours for push notifications. 0-23 (UTC offset is the user's local browser tz).
  quiet_hours_start?: number | null;
  quiet_hours_end?: number | null;
  // Webhook fan-out for high-match alerts (additive to push). Both nullable; either or both.
  slack_webhook_url?: string | null;
  discord_webhook_url?: string | null;
  // ── Custom job sources — user-curated portal slugs ──────────────────────
  // Each entry is a Greenhouse / Ashby / Lever org slug to scrape on each
  // cron run. The cron aggregates every user's custom_sources, dedupes by
  // (kind, slug), and folds them into the shared scrape pool. Jobs land in
  // the shared jobs collection like any other; per-user filters then narrow
  // each user's feed.
  custom_sources?: Array<{ kind: 'greenhouse' | 'ashby' | 'lever'; slug: string; label?: string | null }>;
  // ── Job-pull control — drives the ACTUAL scrape (the query + location sent
  //    to the job boards), NOT just post-pull filtering. This is the knob that
  //    decides WHAT enters the pool. Empty search_queries → platform defaults
  //    so a fresh user's pool is never empty. The sync cron unions every
  //    user's config (deduped, capped) so one scrape serves everyone. ──
  search_queries?: string[];        // e.g. ["react developer", "devops engineer"]
  search_locations?: string[];      // e.g. ["Remote", "Austin, TX"] — sent verbatim to the boards
  search_remote_only?: boolean;     // true → only "Remote" is searched, ignore other locations
  // ── Auto-Pilot — when on, any job clearing autopilot_min_score gets a
  //    tailored resume + cover letter auto-generated and staged as a
  //    "ready to apply" Application. The user still taps Apply — we never
  //    submit to a third-party board on their behalf (ToS + safety). ──
  autopilot_enabled?: boolean;
  autopilot_min_score?: number;     // default 85
  autopilot_last_run?: string | null;
  created_at: string;
  updated_at: string;
};

export type Job = {
  id: string;
  source: JobSource;
  source_id: string;
  source_url: string;
  title: string;
  company: string | null;
  company_url: string | null;
  location: string | null;
  is_remote: boolean;
  remote_kind: RemoteKind | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: 'year' | 'month' | 'hour';
  description: string | null;
  description_html: string | null;
  posted_at: string | null;
  discovered_at: string;
  raw: unknown;
  match_score: number | null;
  match_reasons: string[];
  is_excluded: boolean;
  // Parsed minimum-required years-of-experience from the JD. null = couldn't tell.
  // Used by listJobs to apply each user's max_required_years filter.
  required_years?: number | null;
};

export type Application = {
  id: string;
  user_id: string;        // FK to User.id — every Application is owned by exactly one user.
  job_id: string;         // FK to the shared Job doc — multiple users may save the same job.
  status: ApplicationStatus;
  applied_at: string | null;
  resume_used: string | null;
  cover_letter: string | null;
  notes: string | null;
  next_action_at: string | null;
  // ── Auto-Pilot artifacts ──────────────────────────────────────────────
  // Populated by /api/cron/autopilot when a job clears the user's min score.
  // auto_prepared=true + status='queued' = "ready to apply": resume + cover
  // letter are generated and staged. The /autopilot page surfaces these; the
  // user reviews and taps Apply (which opens the board's apply URL).
  auto_prepared?: boolean;
  prepared_resume_md?: string | null;
  prepared_cover_letter?: string | null;
  prepared_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type JobWithApplication = Job & {
  application: Application | null;
};

// Used by scrapers — what they return before we persist
export type RawJob = Omit<
  Job,
  'id' | 'discovered_at' | 'match_score' | 'match_reasons' | 'is_excluded'
>;

export type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

// Comp Intelligence — cached salary benchmarks per (company, role, level, geography).
// The /comp page lets Boost-tier users look up ranges; on cache miss the
// /api/comp/lookup endpoint asks Claude (with web search) to research and
// caches the structured result. Refreshed weekly via a soft TTL.
export type CompBenchmark = {
  id: string;
  /** Cache key — normalized "{company}::{role}::{level}::{geo}" lowercase. */
  cache_key: string;
  company: string;
  role: string;
  level: string | null;          // e.g. "Senior", "Staff", "L6"
  geography: string | null;      // e.g. "United States — remote", "SF Bay Area"
  /** Resolved salary band in USD/year. */
  base_low: number | null;
  base_high: number | null;
  total_low: number | null;
  total_high: number | null;
  equity_notes: string | null;
  /** Bulleted narrative — sources, caveats, geo adjustments, etc. */
  narrative_md: string;
  sources: Array<{ label: string; url: string | null }>;
  /** Confidence Claude assigned: 0-100. Low = "thin public data, take with salt." */
  confidence: number;
  researched_at: string;
  expires_at: string;            // researched_at + 7d
  created_at: string;
  updated_at: string;
};

// Saved assessment results — Zapier AI Fluency, HackerRank, take-home reports,
// portfolio reviews, anything that proves AI/skill fluency to a hiring team.
// Once stored, JobScout auto-includes the summary_md as context in every
// cover-letter, resume-tailor, Upwork-score, and bid-draft prompt.
export type AssessmentKind = 'paste' | 'image' | 'pdf' | 'text' | 'url';

export type Assessment = {
  id: string;
  user_id: string;          // 'me' single-user fallback
  name: string;             // user-editable label, e.g. "Zapier AI Fluency — Transformative tier"
  summary_md: string;       // structured markdown — what the AI scorer/drafter reads
  /** Raw paste / extracted text. Optional; summary_md is the canonical context. */
  raw_text?: string | null;
  source_kind: AssessmentKind;
  source_filename: string | null;  // original filename (display only)
  source_url: string | null;       // optional link back to the live result (e.g. ai-fluency-hub.vercel.app)
  is_active: boolean;       // true assessments fold into prompts; toggle off without deleting
  created_at: string;
  updated_at: string;
};

// STAR+R interview story — Situation / Task / Action / Result / Reflection.
// Ported from santifer/career-ops's Interview Story Bank. Accumulating
// 5-10 strong stories across applications gives you stock answers for any
// behavioral question. The Reflection field is the +R — what you'd do
// differently — which is the one most candidates skip.
// A scored Upwork job extracted from a job-alert email. The inbox-watcher
// cron creates these; the /upwork-leads page renders them. When verdict is
// "apply" the cron also pre-drafts the full application (cover letter +
// screening-question answers) so applying is one extension click.
export type UpworkLeadStatus = 'new' | 'viewed' | 'applied' | 'dismissed';

export type UpworkLeadDraftAnswer = { heading: string; text: string };

export type UpworkLead = {
  id: string;                 // derived from the Upwork job id (~01.../~02...)
  user_id: string;            // 'me' single-user fallback
  job_url: string;            // canonical https://www.upwork.com/jobs/~0...
  title: string;
  description: string;        // text extracted from the alert email or RSS
  budget_text: string | null; // raw budget string, e.g. "$3,000" or "$50-100/hr"
  /** Where this lead was discovered. Used to route scoring + draft pipelines. */
  source_kind?: 'email' | 'rss' | 'extension' | 'apify';
  source_email_id?: string;   // Gmail message id (when source_kind=email)
  source_id?: string;         // raw Upwork job id (when source_kind=rss)
  source_search: string | null; // the saved-search name (email) or rss source label
  // Scoring (from /api/upwork/score logic). 'undecided' = not scored yet
  // (lead came from a passive source like RSS and hasn't run through Claude).
  verdict: 'apply' | 'skip' | 'undecided';
  score: number;
  reasons: string[];
  dimensions: Array<{ name: string; score: number; note: string }>;
  filter_violations: string[];
  // Pre-drafted application (only when verdict === 'apply')
  draft_cover_letter: string | null;
  draft_answers?: UpworkLeadDraftAnswer[] | null;
  suggested_bid: number | null;
  suggested_bid_kind: 'hourly' | 'fixed' | null;
  status: UpworkLeadStatus;
  posted_at?: string | null;
  discovered_at: string;
  updated_at: string;
};

export type InterviewStory = {
  id: string;
  user_id: string;        // "me" for single-user fallback; Firebase UID once auth threads
  title: string;          // short label, e.g. "Tesla CAN-bus diagnostic war story"
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;     // what you'd do differently, lessons learned
  tags: string[];         // topical tags: "leadership", "conflict", "ambiguity", "failure", "speed", etc.
  /** Behavioral question patterns this story answers — used by the matcher. */
  question_archetypes: string[];   // e.g. "Tell me about a time you led without authority"
  job_ids_used: string[]; // jobs where this story was deployed (so we don't reuse in the same loop)
  created_at: string;
  updated_at: string;
};

// ──────────────────────────────────────────────────────────────────────
// In-house error monitoring (Batch H) — Sentry-grade capture without a
// third-party vendor. Server + client + user-reported errors all flow here.
// ──────────────────────────────────────────────────────────────────────
export type ErrorSource = 'server' | 'client' | 'user_reported';
export type ErrorStatus = 'open' | 'in_progress' | 'resolved' | 'ignored';

export type ErrorRecord = {
  id: string;
  /** Hash of (name + normalized message + first non-node_modules stack frame).
   *  Identical errors collapse to one group. ~12 hex chars. */
  group_key: string;
  message: string;
  name: string;                     // Error.name — e.g. "TypeError"
  stack: string | null;             // full stack trace, capped to 6KB
  source: ErrorSource;
  path: string | null;              // URL/route where it fired
  user_id: string | null;
  user_email: string | null;
  user_agent: string | null;
  release: string | null;           // Cloud Run revision name (K_REVISION env)
  /** Free-form integration tag for circuit-breaker matching, e.g. "anthropic" | "stripe" | "smtp". */
  integration: string | null;
  context: Record<string, unknown> | null;
  status: ErrorStatus;
  created_at: string;
  created_day: string;              // YYYY-MM-DD UTC, for date-range queries
};

// ──────────────────────────────────────────────────────────────────────
// Self-healing engine (Batch I) — registry of detectors-and-fixers that
// run on a cron + on-demand. Each run writes a HealEvent for the audit
// trail visible on /admin/healing.
// ──────────────────────────────────────────────────────────────────────
export type HealEvent = {
  id: string;
  healer_id: string;                // e.g. "anthropic_circuit_breaker"
  ok: boolean;                      // did the healer itself run without crashing?
  acted: boolean;                   // did it actually take an action (vs. all clear)?
  summary: string;                  // one-line human-readable result
  details: Record<string, unknown> | null;
  triggered_by: 'cron' | 'manual' | 'error_spike';
  created_at: string;
  created_day: string;
};

// ──────────────────────────────────────────────────────────────────────
// Feedback — user-submitted bug reports + feature requests + free-form notes.
// Posted from the FloatingOverlay widget on any in-app page; surfaced in
// /admin/feedback for triage. Pattern ported from SpaOwner-HQ CRM.
// ──────────────────────────────────────────────────────────────────────
export type FeedbackType = 'bug' | 'feedback' | 'feature';
export type FeedbackStatus = 'open' | 'in_progress' | 'resolved' | 'wont_fix';

export type Feedback = {
  id: string;
  user_id: string | null;     // null if submitted by an unauthenticated visitor
  user_email: string | null;  // snapshotted at submit time for fast triage
  type: FeedbackType;
  message: string;
  page_url: string;           // the URL the user was on when they submitted
  user_agent: string | null;
  status: FeedbackStatus;
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
};
