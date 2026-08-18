# Course Calendar — Cloudflare Worker Deployment

A course scheduling calendar that parses pasted HKU enrollment text in several
layouts (course page section lists, Temporary Course Lists, and the original
schedule-text formats), renders a **weekly pattern view** (default) plus a
monthly calendar with a **daily timeline from 8:00 AM to 8:00 PM**, flags time
conflicts, computes semester credits, and includes a **planner** that picks a
conflict-free combination of sections (with Standard / Holidays / Balanced
modes and per-semester handling). Deployed on **Cloudflare Workers**.

All data lives in browser `localStorage` — no backend required.

## Project layout

```
public/
  calendar.html   # HTML shell
  style.css       # all styles
  app.js          # all application logic
src/
  worker.js       # Cloudflare Worker (serves assets + optional API)
wrangler.toml     # Worker + assets config
```

The app is split into separate files so each stays small and easy to develop —
no single 1000+-line file.

## Quick start

### 1. Install dependencies

Uses `wrangler` to run/deploy. Requires Node.js 18+.

```powershell
npm install
```

> If `npm` isn't available, install the Cloudflare CLI globally instead:
> `npm install -g wrangler` (or `pnpm add -g wrangler`).

### 2. Run locally

```powershell
npm run dev
```

Starts `wrangler dev` with the assets binding — open the printed URL
(usually http://localhost:8787/calendar.html) in your browser.

### 3. Deploy

```powershell
npx wrangler login       # first time only (browser auth)
npm run deploy
```

The CLI prints a `*.workers.dev` URL on success. To use a custom domain, add
a `routes` entry in `wrangler.toml` and attach it in the Cloudflare dashboard.

### Live logs

```powershell
npm run tail
```

## Input formats

- **Stage Course**: a full course page (the "Section Details" section list).
  Handles tab-separated, space-aligned, concatenated, and one-cell-per-line
  layouts, plus the Temporary-Course-List entries embedded on some pages.
  Semester is read from the page header (or inferred from session dates).
- **Stage Temp List**: a full Temporary Course List (the
  `Class / Days-Times / Room / Instructor / Units / Status` layout) — stages
  one section per course.
- **Add to Calendar**: schedule-text blocks ending in a date range like
  `03/09/2026 - 24/09/2026` (original Topic/Days/Room/Instructor or Section
  Details layouts).

## Planner

Stage several courses, optionally **lock** a section per course (checkbox),
choose a mode, then **Find schedule**:

- **Standard** — a conflict-free combination of sections (one per course).
- **Holidays** — prefers keeping entered holiday dates class-free; only
  overloads a holiday when a course has no other option.
- **Balanced** — also spreads each day's class load as evenly as possible.

Semester 1 and Semester 2 courses are kept separate and reported per semester.
**Show plan on calendar** loads the chosen sections' sessions into the
calendar (and the weekly load / average hours-per-day are shown per semester).

## Configuration notes

- `wrangler.toml` keeps the app on the Workers runtime (`workers.dev = true`).
  For a static-only deployment you could remove `main`/`src/worker.js`, but the
  Worker is kept so `/health` and future `/api/*` routes (e.g. KV/D1 sync) are
  easy to add.
- `not_found_handling = "none"` lets the Worker control 404 responses.
- The calendar reads/writes its entries to `localStorage` key
  `enroll_calendar_entries` — entries do **not** sync across devices.
- Day tiles render an 8 AM–8 PM timeline; blocks are positioned by real clock
  time (top = start, height = duration), so empty space shows the gaps between
  classes. Courses starting before 8 AM or ending after 8 PM are clamped to
  the visible window with ▲/▼ markers.
- HTML is served with `Cache-Control: no-store` so the browser always fetches
  the newest deploy.
