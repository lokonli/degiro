# DEGIRO Portfolio Ledger

A self-hosted portfolio dashboard for a DEGIRO brokerage account. Imports
transaction/dividend history (CSV upload or the DEGIRO API), prices holdings
against Yahoo Finance, and renders value, performance, and return-by-year
charts.

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

## DEGIRO API sync credentials

The CSV import (`/import`) works with no setup. The optional direct DEGIRO
API sync (`lib/degiroClient.ts`, `lib/degiroSync.ts`, `POST /api/degiro-sync`)
needs three env vars — copy `.env.example` to `.env.local` (gitignored) and
fill them in:

```
DEGIRO_USERNAME=
DEGIRO_PASSWORD=
DEGIRO_TOTP_SECRET=
```

- `DEGIRO_USERNAME` / `DEGIRO_PASSWORD` — your normal DEGIRO login
  credentials.
- `DEGIRO_TOTP_SECRET` — the **base32 seed** behind your account's
  authenticator-app 2FA, not a 6-digit code (the app generates the code
  itself, the same way an authenticator app would — see
  `generateTotp`/`base32Decode` in `lib/degiroClient.ts`). DEGIRO's UI only
  shows this seed once, at setup time, disguised as a QR code:
  1. In the DEGIRO webtrader, go to **Settings → Profile → Two-factor
     authentication** (or **Security**, depending on the current UI) and
     start (or reset) the authenticator-app setup.
  2. On the "scan this QR code" screen, look for a **"can't scan the code?"**
     / **"enter manually"** link — it reveals the same secret as a plain
     base32 string instead of a QR code. That string is `DEGIRO_TOTP_SECRET`.
  3. Finish enrollment by entering the current 6-digit code the secret
     produces (e.g. paste the secret into any authenticator app or use
     `generateTotp` locally) to confirm 2FA setup.
  4. If you already enabled 2FA and never saved the seed, DEGIRO won't show
     it to you again — you'll need to disable and re-enable 2FA to get a
     fresh one.

Treat `DEGIRO_TOTP_SECRET` like a password: it's a long-lived credential that
can mint valid 2FA codes indefinitely, not a one-time code. Never commit
`.env.local`.

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
