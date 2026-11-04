# JobScout

> **Portfolio snapshot.** A sanitized, history-free copy of a private repository, published to show the work.
> Credentials, customer and lead data, internal notes and third-party material were removed, and real client
> and people names were replaced with fictional ones, so this copy is not meant to run as-is.

- **What it is:** JobScout, an AI job-search SaaS: listings aggregated from the major job boards, match scoring, AI resume and cover-letter tailoring, push alerts and Stripe subscriptions.
- **Stack:** Next.js, React, Tailwind, Firebase, Firebase Admin, Stripe, Anthropic Claude API, Zod
- **Languages:** TypeScript, JavaScript, CSS, PowerShell
- **Private repo history:** 91 commits, 2026-05-08 to 2026-06-03
- **This snapshot:** 242 files
- **Built by:** Cory Salisbury, with Claude Code

_All rights reserved. Shared for portfolio review only; no license is granted to copy, modify or redistribute this code._

---

JobScout (jobscout-hq.com) is an AI job-search SaaS. It pulls roles from LinkedIn, Indeed and ZipRecruiter, scores each match, tailors the resume and cover letter, and sends push alerts.

## Quick start (in-memory mode — works with no keys)

```powershell
cd C:\Users\you\Downloads\JobScout
npm run dev
```

Open http://localhost:3000. You get seeded sample jobs so you can click around immediately.

## Wiring up real data

### 1. Supabase (persistent storage)
1. Create a Supabase project → SQL Editor → paste `supabase/schema.sql` → run.
2. Project Settings → API. Copy:
   - Project URL → `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`
   - `anon` public → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. JSearch (LinkedIn / Indeed / ZipRecruiter aggregator)
1. Sign up at https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch (free tier: 200 req/mo).
2. Copy your X-RapidAPI-Key into `JSEARCH_RAPIDAPI_KEY`.

KSL scraping works without keys.

### 3. Push notifications (VAPID)
```powershell
npx web-push generate-vapid-keys
```
Copy the output into `.env.local`:
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

### 4. Cron (Vercel)
Set `CRON_TOKEN` to a random string. `vercel.json` already schedules `/api/cron/sync` every 2 hours.

## Mobile install
1. Deploy to Vercel (or run locally over HTTPS).
2. Open in Safari (iOS 16.4+) or Chrome.
3. Share → Add to Home Screen.
4. Open the installed app → Settings → Enable on this device.
5. You'll now get notifications for new high-match jobs (≥70 score, or any St George listing).

## Architecture

```
src/app          feed, jobs/[id], saved, dashboard, settings, actions, api/cron
src/components   BottomNav, JobCard, FilterBar, PushSubscribeCard, SyncButton
src/lib          types, matching, db, seed, supabase, scrapers/{jsearch,ksl,mock}
public/sw.js     service worker (push + click handlers)
supabase/        schema.sql
n8n/             workflow template (alternative to Vercel cron)
resume/          two resume versions (Automation Engineer + Solutions Architect)
```

## How matching works

`src/lib/matching.ts` scores 0–100 from:
- Keyword hits (max 40)
- Title signals (Automation / Integration / Solutions Architect / Forward Deployed) (max 20)
- Location: Remote = 25, St George = 25, hybrid = 15, Utah County = 12, SLC = 10
- Salary floor (≥ $150k) = 15

Excluded keywords (e.g. `automotive technician`) zero the score.

Notify thresholds:
- Any St George job ≥ 60
- Any salary-floor-met job ≥ 75

## Auto-apply

Scaffolded as 1-click "mark applied". True auto-submit requires per-board form-fill (LinkedIn EasyApply, Indeed). Suggested next step: a Playwright worker triggered by `/api/cron/apply` reading the queue.

## Resume versions
- `resume/Cory_Salisbury_Automation_Engineer.md` — automation/integration positioning
- `resume/Cory_Salisbury_Solutions_Architect.md` — customer-facing technical positioning

Both lead with the Brain knowledge system + Claude Code automation work, then translate the Tesla / Rivian / SpaceX experience into "complex-systems" language.
