-- JobScout schema (Postgres / Supabase)
-- Run this in Supabase SQL Editor or via `supabase db push` after wiring up the project.

-- ─────────────────────────────────────────────────────────────────────────────
-- profile  — single-user app for now; one row, but future-proofed for auth
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.profile (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  email           text not null,
  phone           text,
  resume_md       text,                       -- the active resume in markdown
  resume_keywords text[] default '{}',        -- extracted skills/keywords
  salary_floor    int  default 150000,        -- $/yr
  remote_pref     text default 'remote_first' check (remote_pref in ('remote_only','remote_first','hybrid_ok','onsite_ok')),
  target_locations text[] default array['St George, UT','Salt Lake City, UT','Utah County, UT','Remote'],
  excluded_keywords text[] default array['automotive','field service','technician'],
  push_subscription jsonb,                    -- web-push subscription object
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- jobs  — every posting we discover, deduped by (source, source_id)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id            uuid primary key default gen_random_uuid(),
  source        text not null check (source in ('linkedin','indeed','ziprecruiter','ksl','jsearch','google_jobs','other')),
  source_id     text not null,                -- stable id from the source
  source_url    text not null,
  title         text not null,
  company       text,
  company_url   text,
  location      text,                          -- raw "City, ST"
  is_remote     boolean default false,
  remote_kind   text check (remote_kind in ('remote','hybrid','onsite') or remote_kind is null),
  salary_min    int,
  salary_max    int,
  salary_period text default 'year' check (salary_period in ('year','month','hour')),
  description   text,
  description_html text,
  posted_at     timestamptz,
  discovered_at timestamptz default now(),
  raw           jsonb,                         -- full source payload for re-parsing later
  -- match-time computed columns (populated by ranker)
  match_score   numeric(5,2),                  -- 0-100
  match_reasons text[] default '{}',
  is_excluded   boolean default false,         -- hits an excluded keyword
  unique (source, source_id)
);

create index if not exists idx_jobs_discovered_at on public.jobs(discovered_at desc);
create index if not exists idx_jobs_match_score   on public.jobs(match_score desc nulls last);
create index if not exists idx_jobs_is_remote     on public.jobs(is_remote);
create index if not exists idx_jobs_location      on public.jobs(location);

-- ─────────────────────────────────────────────────────────────────────────────
-- applications  — user's interaction with a job
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.applications (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  status       text not null default 'saved' check (status in (
    'saved','queued','applied','followed_up','interview','offer','rejected','withdrawn','dismissed'
  )),
  applied_at   timestamptz,
  resume_used  text,                           -- which resume version was sent
  cover_letter text,
  notes        text,
  next_action_at timestamptz,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (job_id)
);

create index if not exists idx_applications_status on public.applications(status);
create index if not exists idx_applications_next_action on public.applications(next_action_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- alert_log  — every push notification we sent (so we don't double-notify)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.alert_log (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs(id) on delete cascade,
  kind       text not null check (kind in ('new_match','high_match','salary_above_floor','remote_st_george','daily_digest')),
  sent_at    timestamptz default now(),
  payload    jsonb
);

create index if not exists idx_alert_log_job on public.alert_log(job_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- search_runs  — bookkeeping for each scraper run
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.search_runs (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,
  query        text,
  location     text,
  started_at   timestamptz default now(),
  finished_at  timestamptz,
  found_count  int,
  new_count    int,
  error        text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- helpers
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_profile_touch on public.profile;
create trigger trg_profile_touch before update on public.profile
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_applications_touch on public.applications;
create trigger trg_applications_touch before update on public.applications
  for each row execute function public.touch_updated_at();
