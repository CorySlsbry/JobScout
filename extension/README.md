# JobScout — Upwork Bidder (Chrome extension)

Manifest V3 Chrome/Edge extension. AI-scores Upwork jobs against your
JobScout base resume and drafts proposals with Claude. **Admin-only** —
the server gates these endpoints to the JobScout admin email.

## What it does

- **Score a job** (Alt+Shift+J on any Upwork job page) — Claude Haiku
  reads the JD + your resume + your filters, returns
  `apply` / `skip` with reasons. Hard-filter trips (time tracker,
  fixed-schedule, low budget, banned keywords) short-circuit BEFORE the
  Claude call, so most jobs cost nothing.
- **Draft proposal** (button appears when verdict = apply) — Claude
  Sonnet writes a 120-180 word proposal grounded in your resume. Same
  no-fabrication rules as the resume tailor.
- **Fill Upwork form** (on `/proposals/job/*`) — pastes the proposal
  into Upwork's cover-letter textarea. **You** click Send.

## Setup

1. Sign in to JobScout at your deployed URL.
2. Go to `Settings → Browser extension`. Click **Generate token**.
   The `jbsk_...` token is shown ONCE — copy it.
3. Open `chrome://extensions`, enable Developer mode, click **Load
   unpacked**, select this `extension/` folder.
4. Click the JobScout extension icon → paste the token + API base
   (e.g. `https://jobscout-wnwafxvfia-uw.a.run.app`) → Save.
5. Open any Upwork job page and press **Alt+Shift+J**.

## Files

- `manifest.json` — MV3 manifest. Host perms scoped to `*.upwork.com`.
- `background.js` — Service worker. Owns storage + the API proxy that
  keeps the bearer token out of page-script context.
- `content-scripts/upwork.js` — Floating overlay UI on Upwork pages.
  Scrapes the JD with a chain of selectors, falls back to `main`
  innerText.
- `content-scripts/overlay.css` — All styles scoped under
  `#jobscout-root`. Uses `all: revert` to escape Upwork's globals.
- `popup.html` + `popup.js` + `popup.css` — Token + API-base setup.
- `options.html` — First-run instructions (auto-opens on install).

## Server endpoints

- `POST /api/upwork/score` — body `{ jobText, pageUrl? }` →
  `{ ok, score: { verdict, score, reasons, ... } }`. Claude Haiku.
- `POST /api/upwork/draft-bid` — body `{ jobText, preferredBid?, pageUrl? }`
  → `{ ok, bid: { proposal, suggested_bid, suggested_bid_kind, first_question } }`.
  Claude Sonnet.
- `POST /api/profile/extension-token` (session-auth only) — issues
  `jbsk_<24-byte-base64url>`; server stores sha256(token).
- `DELETE /api/profile/extension-token` — revoke.

CORS: both Upwork API routes allow `*` origin. The bearer token is the
only credential — there is no cookie path from upwork.com to JobScout.

## Why a browser extension (not a server-side cron)

Upwork ToS §6 explicitly bans automated bidding. Server-side login from
Cloud Run IPs is a one-strike-and-banned path: account terminated, JSS
to zero, Connects burned, no recovery. The extension runs in your
already-authenticated session — you're using your own browser, which is
exactly what Upwork allows.

## Security notes

- The bearer token is stored in `chrome.storage.sync` (not `localStorage`)
  so it's not page-readable.
- The content script never sees the token — it passes API calls through
  the service worker, which adds the `Authorization` header out of
  reach of page scripts.
- The server stores only `sha256(token)`. The plaintext is shown to
  you exactly once at generation time.
- Admin-only on the server side via the existing `is_admin` flag
  (`cory.salisbury@gmail.com`).
