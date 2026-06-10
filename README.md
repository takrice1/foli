# FOLI — First Out, Last In

Find the first and last commercial flights at any airport worldwide,
across every airline — majors, regionals, and charters.

Live at **[flyfoli.com](https://flyfoli.com)**.

---

## Quick Start

```bash
# 1. Frontend (vite on :5173, proxies /api → local worker)
npm install
npm run dev

# 2. Worker (separate terminal — local worker on :8787)
cd worker
npm install
npx wrangler login
npx wrangler dev
```

Local worker secrets go in `worker/.dev.vars` (gitignored — never commit keys).

## Deploy

```bash
# Worker
cd worker && npx wrangler deploy

# Frontend
npx vercel deploy --prod        # builds and aliases to flyfoli.com
```

Worker secrets (set once per environment):

```bash
npx wrangler secret put FA_API_KEY          # flightaware.com/commercial/aeroapi/
npx wrangler secret put AIRLABS_KEY         # airlabs.co        (1,000 free calls/mo)
npx wrangler secret put AVIATIONSTACK_KEY   # aviationstack.com (500 free calls/mo)
npx wrangler secret put AUTH_SECRET         # random 32+ bytes — signs session JWTs
```

## Architecture

| Layer    | Tech                                                  |
|----------|-------------------------------------------------------|
| Frontend | React 18 + Vite, CSS Modules, installable PWA         |
| Proxy    | Cloudflare Worker (`foli-proxy`)                      |
| Hosting  | Vercel (rewrites `/api/*` → worker)                   |
| Data     | FlightAware AeroAPI → AirLabs → AviationStack fallback|
| Accounts | Workers KV (`USERS`), PBKDF2 passwords, JWT sessions  |

**Provider waterfall** — the worker tries each flight-data provider in order;
if one fails or returns zero flights the next is tried. Responses are
normalized to a single shape and tagged with `_source` so the UI can show
which provider answered.

**Split-day query** — FlightAware anchors broad time windows to "now", so the
worker queries an early window (00:00–09:00Z, historical) and a late window
(18:00–23:59Z, scheduled) and merges them to find the true first and last
flights of the UTC day. Future dates use scheduled endpoints for both windows.

**Paywall** — flight endpoints require a Bearer session token. Accounts are
created on the login screen (`/api/auth/signup`, `/api/auth/login`); every
account is on the `free` plan until Stripe is wired up for `pro`.

**Caching** — the worker caches per-provider responses in-isolate (5 min);
the frontend caches per airport+date in sessionStorage (60 min) to protect
the FlightAware monthly quota.
