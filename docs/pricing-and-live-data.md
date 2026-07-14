# Pricing, live data, and the "value" endpoints

How `valueEUR`, `todayChangeEUR`, and `weekChangeEUR` are computed, what data
sources feed them, and why a DEGIRO-live-pricing attempt was reverted. Written
up after a debugging session that fixed several real bugs in this area —
read this before touching `lib/portfolio.ts`, `lib/yahoo.ts`,
`lib/degiroClient.ts`, `app/api/value/route.ts`, or `app/weekvalue/route.ts`.

## Data sources

- **Yahoo Finance** (`lib/yahoo.ts`) is the only price source in the app today.
  - `fetchDailyCloses` (range `5y`, cached 3h) builds the historical EOD series
    that drives `portfolioValue`/`dates` in `lib/portfolio.ts` — performance
    charts, dividends math, `weekChangeEUR`, and `valueEUR` all trace back to
    this.
  - `fetchLiveQuote` (range `5d`, cached 15m) gives `todayChangeEUR`/
    `todayChangePct` — a `price` vs `previousClose` diff per held ISIN.
- **DEGIRO** (`lib/degiroClient.ts`) is used only for account data: syncing
  transactions and dividends (`lib/degiroSync.ts`, once/day +
  `POST /api/degiro-sync` on demand). It is **not** used for pricing — see
  "DEGIRO live pricing: tried and reverted" below for why.

## `valueEUR` (`app/api/value/route.ts`)

`valueEUR = series.portfolioValue[lastIdx]` — the last point of the Yahoo EOD
series, for "today".

**Important**: during market hours, Yahoo's chart API returns an **in-progress
bar for "today"**, not a finalized prior close — so `portfolioValue[lastIdx]`
is already a live-ish price, not a stable EOD number. An earlier version of
this endpoint added `todayChangeEUR` on top of it, assuming
`portfolioValue[lastIdx]` was a completed close — that double-counted today's
move (roughly `2×liveMove` instead of `liveMove`) and was confirmed against a
live DEGIRO pull to be off by ~1%. Fixed: `valueEUR` is just
`portfolioValue[lastIdx]`, full stop. Do not add `todayChangeEUR` to it again.

## `todayChangeEUR` / `todayChangePct` (`lib/portfolio.ts`, `lib/yahoo.ts`)

Per held ISIN: `fetchLiveQuote(ticker)` gives `{price, previousClose,
hasTradedToday}`, converted to EUR (`liveEurPrice`, using a separately-fetched
live FX quote for non-EUR holdings), then diffed.

`hasTradedToday` exists because Yahoo's `regularMarketPrice` doesn't reset
before an exchange's regular session opens — it stays pinned to yesterday's
last trade. Without this guard, checking `todayChangeEUR` pre-market reports
*yesterday's* move instead of 0. It's computed by comparing
`regularMarketTime`'s exchange-local calendar date (via
`meta.exchangeTimezoneName`) against today's, per-instrument (each ETF's
exchange has its own timezone/session). When false, that holding contributes
zero change.

Known limitation: Yahoo's free-tier quotes lag DEGIRO's own real-time broker
feed by roughly 0.3-0.8% at any given moment — confirmed by cross-checking
against a live DEGIRO portfolio pull. This is accepted as-is (see below for
why fixing it via DEGIRO wasn't viable).

## `weekChangeEUR` / `weekChangePct` (`app/api/value/route.ts`)

`weekAgoIdx = Math.max(0, lastIdx - 7)`; `weekChangeEUR = valueEUR -
portfolioValue[weekAgoIdx]`. Since `dates`/`portfolioValue` are indexed one
entry per **calendar day** (see `dateRange` in `lib/portfolio.ts`), `lastIdx -
7` is exactly 7 calendar days back — this is the canonical "days back" formula
for this codebase.

`app/weekvalue/route.ts` (the public SVG chart, `?days=N`) must use the same
formula: `startIdx = Math.max(0, n - 1 - days)`, **not** `n - days`. The
`n - days` form is one day short (spans only `days - 1` days of actual
change), so it can silently disagree with `weekChangeEUR` in both magnitude
and sign whenever the extra day is an outlier — this happened in practice
(a mid-week dip made a losing week render as a large gain) and was fixed.
Any future "N days back" logic in this app should use `lastIdx - N` /
`n - 1 - N`, not `n - N`.

## DEGIRO live pricing: tried and reverted

An attempt was made (commit `85e9715`) to source `todayChangeEUR` from
DEGIRO's own live portfolio feed instead of Yahoo, since DEGIRO's broker feed
is the "actual" real-time price. It used
`GET https://trader.degiro.nl/trading/secure/v5/update/{intAccount};jsessionid={sessionId}?portfolio=0&totalPortfolio=0`
(position rows with `price`/`value` already EUR-converted).

**This was reverted** (commit `f6018c2`) after discovering that endpoint does
**not** carry true tick-by-tick live prices. Diagnosis:

- The app's DEGIRO-sourced `todayChangeEUR` stayed frozen at the exact same
  value for 10+ hours spanning a full trading session, while the user
  confirmed DEGIRO's own app showed the price actively moving.
- A direct test confirmed this wasn't a caching bug in our code: polling the
  endpoint with the DEGIRO-recommended incremental pattern (using the
  previous response's `lastUpdated` sequence number instead of always
  requesting `portfolio=0`) returned an explicit empty delta — DEGIRO's
  backend reporting "nothing has changed" — even though real market prices
  had moved and DEGIRO's own UI reflected it.
- Conclusion: `trading/secure/v5/update` reflects a periodic/batch portfolio
  *valuation*, not the live tick feed. DEGIRO's actual live price ticker is
  almost certainly served by a separate, undocumented real-time streaming
  service ("vwd quotecast"). Integrating that would be a materially bigger,
  higher-risk reverse-engineering effort (no public docs, its own
  session/subscription lifecycle) than what exists today — deliberately not
  pursued.

If this is revisited in the future, the starting point is researching DEGIRO's
vwd quotecast protocol, not the `trading/secure/v5/update` endpoint used here.

## Caching / revalidation cadence

- `fetchDailyCloses`: 3h (`DAILY_CLOSE_REVALIDATE_SECONDS`, `lib/yahoo.ts`).
- `fetchLiveQuote`: 15m (`LIVE_QUOTE_REVALIDATE_SECONDS`, `lib/yahoo.ts`).
- `/api/value`, `/api/portfolio`: Next route-level `revalidate = 900` (15m).
- `/weekvalue`: `revalidate = 0` (always re-renders; upstream portfolio data
  is what's cached, via the above).
- `runDegiroSync` (`lib/degiroSync.ts`) calls `revalidatePath` for `/`,
  `/api/portfolio`, `/api/value`, and `/dividends` after a sync writes new
  data, so those routes don't wait out their 15-minute cache after a sync.
  **`/api/value` was missing from this list for a while** (added after
  `/api/value` itself was added) — if a new public/polled route is added,
  remember to add it here too, or it'll serve stale data for up to 15 minutes
  after every sync.
