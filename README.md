# DEGIRO Portfolio Ledger

A self-hosted portfolio dashboard for a DEGIRO brokerage account. Imports
transaction/dividend history (CSV upload or the DEGIRO API), prices holdings
against Yahoo Finance, and renders value, performance, and return-by-year
charts.

Live instance: https://redacted.example.com (private, Cloudflare Access gated).

## Features

- Dashboard with current value, net invested, total return (with/without
  dividends), today's change, dividends received, and fees paid
- Charts: portfolio value vs. capital invested, performance over time
  (rebased %, selectable range), and return by calendar year
- Current holdings table with per-holding allocation and today's change
- Dividends page
- CSV import (`/import`) and an optional DEGIRO API sync
  (`lib/degiroClient.ts`, `lib/degiroSync.ts`) for pulling new transactions
  and dividends directly
- A public `/weekvalue` SVG endpoint (no auth) for embedding the portfolio's
  recent value trend in e.g. a Home Assistant dashboard
- In-app docs viewer (`/docs`) that renders this repo's `docs/*.md` files

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without transaction data
yet, you'll land on an empty state pointing at `/import`.

Data lives on disk under `data/` (`transactions.json`, `instruments.json`,
`dividends.json`) and is read at request time — there's no separate database.
These files are gitignored since they hold personal financial data.

## Tech

Next.js (App Router) + React + TypeScript + Tailwind CSS + Recharts.

## Docs

- `docs/pricing-and-live-data.md` — how prices/values are computed, and the
  data sources involved. Read before touching `lib/portfolio.ts`,
  `lib/yahoo.ts`, `lib/degiroClient.ts`, `app/api/value/route.ts`, or
  `app/weekvalue/route.ts`.
- `docs/dashboard-charts.md` — the dashboard's charts and how the component
  tree under `components/dashboard/` is organized. Read before touching
  `components/Dashboard.tsx` or its charts.
- `docs/tmux-usage.md` — tmux usage notes for this project.
- `DEPLOYMENT.md` — how the live instance is deployed and run (self-hosted,
  not Vercel — the import feature needs a writable, persistent filesystem).
