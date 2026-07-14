# Dashboard charts

Notes on the dashboard's charts — read this before touching the "Return by
year" bar chart or adding another derived-stat chart to the dashboard.

`components/Dashboard.tsx` is a thin layout shell; each chart/section lives
in its own file under `components/dashboard/` (e.g. `ValueChart.tsx`,
`PerformanceChart.tsx`, `YearlyReturnsChart.tsx`, `HoldingsTable.tsx`), with
shared formatters in `components/dashboard/format.ts`.

## "Return by year" bar chart

Shows each calendar year's total return (incl. dividends) as a EUR bar,
labeled with the EUR gain/loss on top and that year's return as a percentage
of average invested capital in brackets below it.

### Data: `computeYearlyReturns` (defined locally in `components/dashboard/YearlyReturnsChart.tsx`)

`PortfolioSeries.portfolioValue` and `netInvestedInclDividends` (from
`lib/portfolio.ts`) are cumulative running series, one entry per calendar
day. Cash flows — buys, sells, dividend payouts — can move
`netInvestedInclDividends` up *or* down at any point in a year. So a year's
EUR return isn't `portfolioValue[end] - portfolioValue[start]`; that would
conflate market performance with money moved in or out during the year.

Instead:
- `gainAt(idx) = portfolioValue[idx] - netInvestedInclDividends[idx]` — this
  is the same quantity `performancePctInclDividends` is derived from, and
  exactly what the dashboard's "Total return (incl. dividends)" stat tile
  shows at `idx = n-1`.
- A year's `gainEUR` is `gainAt(endIdx) - gainAt(startIdx - 1)` (or just
  `gainAt(endIdx)` for the very first day overall, where there's no prior
  index).
- `avgInvestedEUR` is the mean of `netInvestedInclDividends` over the days
  within that year — the denominator for the percentage label, so a big
  deposit right at a year's start or end doesn't distort the percentage the
  way a simple start/end average would.
- **This telescopes**: summing `gainEUR` across every year returned equals
  `portfolioValue[n-1] - netInvestedInclDividends[n-1]`, i.e. the "Total
  return (incl. dividends)" stat tile's value exactly. This was verified
  against live data when the chart was built (two years, summing to
  €93,727.71, matching the stat tile to the cent) — if you change this logic,
  re-check that property holds; it's the cheapest correctness check
  available.
- Partial years get a `(YTD)` suffix only on the *current*, still-open year;
  a truncated *first* year (account opened mid-year) just shows the plain
  year — both are "partial" but only the ongoing one needs the label, since
  a finished truncated first year isn't misleading on its own.

Dividends are **included** in this figure (total return), matching the
existing "Total return (incl. dividends)" stat tile's convention rather than
the dividend-excluded `performancePct`/`netInvested` pair — this was an
explicit choice, not a default to leave unquestioned if revisited.

### Why this logic lives next to the chart component, not `lib/portfolio.ts`

`lib/portfolio.ts` imports `lib/dataStore.ts`, which imports Node's `fs`.
The dashboard's chart components are `"use client"` — importing any
*runtime* value (not just a `import type`) from `lib/portfolio.ts` pulls
that whole module graph, `fs` included, into the client bundle and breaks
the build ("Module not found: Can't resolve 'fs'"). This bit during
development: `computeYearlyReturns` was first written in `lib/portfolio.ts`
and had to be moved into the client component itself once the build broke.
The `rebasePerformance` helper (for the performance-% line chart) lives in
`components/dashboard/PerformanceChart.tsx` for the same reason — this is
the established pattern for derived-stat functions used only by one client
chart component: they take an already-fetched `PortfolioSeries` (or
`ChartPoint[]`) and live next to their chart, not in `lib/`. Only `import
type { PortfolioSeries }` (type-only, erased at compile time) is safe to use
from any of these files — a runtime import is what breaks the build.

### The label: `LabelList`'s `content` function doesn't get `payload`

Recharts' `LabelList` filters an entry down to SVG-valid props
(`x`/`y`/`width`/`height`/`value`/`index`/etc.) before invoking a custom
`content` function — `payload` (the full data row) is dropped, even though
the `LabelListEntry` type technically includes it. Confirmed by reading
`node_modules/recharts/es6/component/LabelList.js` directly rather than
assuming from the `.d.ts` types, since this codebase's recharts version
(3.9.2) doesn't behave the same as older v2-era examples found online.

Consequence: `<LabelList dataKey="gainEUR" .../>` gives the label component
`gainEUR` as `value`, but not the year's `returnPct` for the second line.
The workaround used here: pass the full `yearlyReturns` array into the label
component via a wrapper closure —

```tsx
<LabelList
  dataKey="gainEUR"
  content={(props: object) => <YearlyReturnLabel {...props} returns={yearlyReturns} />}
/>
```

— and look up `returns[index]?.returnPct` inside `YearlyReturnLabel` using
the `index` prop recharts does provide. If a future label needs more than
one extra field from the row, this same pattern (closure-inject the source
array, index into it) is the way to do it — don't assume `payload` is
available.

### Label positioning

Two-line labels sit **above** a gain bar (both lines above the bar's top
edge, EUR line furthest out, percentage line closest to the bar) and
**below** a loss bar (EUR line closest to the bar's bottom edge, percentage
line furthest out) — so reading order is always "EUR value, then percentage
below it" regardless of which side of the zero line the bar is on. This
needs the chart's `margin.top`/`margin.bottom` to be large enough for two
text lines (currently `top: 36, bottom: 20`) — if label font size or line
spacing changes, check the tallest/most-negative bar isn't clipped.
