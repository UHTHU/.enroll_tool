# Course Calendar — Cloudflare Worker Deployment

A single-file course scheduling calendar that parses pasted enrollment text
(two formats: the original Topic/Days/Instructor layout and the Section
Details layout), renders a **daily timeline from 8:00 AM to 8:00 PM** where
each course block is placed at its actual time slot (top = start time,
height = duration) so gaps between classes are visible. It also flags time
conflicts and computes semester credits. Deployed on **Cloudflare Workers**.

Deployed on **Cloudflare Workers** as a static site served through a Worker.
All data lives in browser `localStorage` — no backend required.

## Project layout

```
public/
  calendar.html   # the entire app (HTML/CSS/JS) — static asset
src/
  worker.js       # Cloudflare Worker (serves assets + optional API)
wrangler.toml     # Worker + assets config
```

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