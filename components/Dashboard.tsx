"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PortfolioSeries } from "@/lib/portfolio";

const ThemeToggleSlot = dynamic(() => import("@/components/ThemeToggle"), { ssr: false });

const eur = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const eurPrecise = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
const pct = (v: number, digits = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;

function formatTick(date: string) {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function formatFull(date: string) {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function formatTickShort(date: string) {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

const PERFORMANCE_RANGES = [
  { key: "today", label: "Today" },
  { key: "week", label: "Last week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "12m", label: "Last 12 months" },
  { key: "all", label: "All" },
] as const;

type RangeKey = (typeof PERFORMANCE_RANGES)[number]["key"];

/** Start date (inclusive, YYYY-MM-DD) for a given range, anchored to the last available day. */
function rangeStartDate(lastDateIso: string, range: RangeKey): string {
  const last = new Date(lastDateIso + "T00:00:00Z");
  switch (range) {
    case "today":
      return lastDateIso;
    case "week": {
      const d = new Date(last);
      d.setUTCDate(d.getUTCDate() - 6);
      return d.toISOString().slice(0, 10);
    }
    case "month":
      return new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1)).toISOString().slice(0, 10);
    case "year":
      return new Date(Date.UTC(last.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
    case "12m": {
      const d = new Date(last);
      d.setUTCDate(d.getUTCDate() - 364);
      return d.toISOString().slice(0, 10);
    }
    case "all":
      return "0000-00-00";
  }
}

type ChartPoint = { date: string; value: number; invested: number; performance: number };

/**
 * Rebases performance to 0% at the window's first day: nets out the window's
 * starting gain from each day's gain (value - invested), then divides by that
 * day's current net-invested amount — the same moving base the since-inception
 * metric uses. A fixed denominator pinned to the window's starting value would
 * blow up for the "all" range, since this portfolio started tiny (~€1.2k) and
 * grew to 400x that; dividing by the then-current invested amount avoids it.
 */
function rebasePerformance(data: ChartPoint[], windowStart: string): ChartPoint[] {
  const windowed = data.filter((d) => d.date >= windowStart);
  if (windowed.length === 0) return windowed;
  const baseGain = windowed[0].value - windowed[0].invested;
  return windowed.map((d) => {
    const incrementalGain = d.value - d.invested - baseGain;
    const pct = d.invested > 0 ? (incrementalGain / d.invested) * 100 : 0;
    return { ...d, performance: pct };
  });
}

type YearlyReturn = {
  year: string; // "2024"
  label: string; // "2024", or "2026 (YTD)" for a still-open year
  gainEUR: number;
  avgInvestedEUR: number;
  returnPct: number;
  isPartial: boolean; // first year (data starts mid-year) or the current, still-open year
};

/**
 * Total return (incl. dividends) per calendar year, matching performancePctInclDividends's convention.
 * portfolioValue and netInvestedInclDividends are cumulative running series where cash flows (buys,
 * sells, dividends) can move netInvestedInclDividends up or down at any point in a year, so a year's EUR
 * return isn't value-at-end minus value-at-start — it's the change in (portfolioValue -
 * netInvestedInclDividends) across the year, which nets out those flows automatically. Summing gainEUR
 * across every returned year telescopes to portfolioValue[n-1] - netInvestedInclDividends[n-1], i.e. the
 * "Total return (incl. dividends)" stat tile below.
 */
function computeYearlyReturns(series: PortfolioSeries): YearlyReturn[] {
  const { dates, portfolioValue, netInvestedInclDividends } = series;
  if (dates.length === 0) return [];

  const gainAt = (idx: number) => portfolioValue[idx] - netInvestedInclDividends[idx];

  const yearBounds = new Map<string, { startIdx: number; endIdx: number }>();
  dates.forEach((date, idx) => {
    const year = date.slice(0, 4);
    const bounds = yearBounds.get(year);
    if (bounds) {
      bounds.endIdx = idx;
    } else {
      yearBounds.set(year, { startIdx: idx, endIdx: idx });
    }
  });

  const results: YearlyReturn[] = [];
  for (const [year, { startIdx, endIdx }] of yearBounds) {
    const priorGain = startIdx === 0 ? 0 : gainAt(startIdx - 1);
    const gainEUR = gainAt(endIdx) - priorGain;

    let investedSum = 0;
    for (let i = startIdx; i <= endIdx; i++) investedSum += netInvestedInclDividends[i];
    const avgInvestedEUR = investedSum / (endIdx - startIdx + 1);

    const returnPct = avgInvestedEUR > 0 ? (gainEUR / avgInvestedEUR) * 100 : 0;
    const isPartial = dates[startIdx] !== `${year}-01-01` || dates[endIdx] !== `${year}-12-31`;
    const isCurrentBucket = endIdx === dates.length - 1;
    const label = isPartial && isCurrentBucket ? `${year} (YTD)` : year;

    results.push({ year, label, gainEUR, avgInvestedEUR, returnPct, isPartial });
  }
  return results;
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "gain" | "loss" | "neutral";
}) {
  const subColor =
    tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-ink-muted";
  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-5 py-4">
      <div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">{label}</div>
      <div className="mt-1.5 font-mono text-2xl tabular text-ink">{value}</div>
      {sub && <div className={`mt-1 font-mono text-xs tabular ${subColor}`}>{sub}</div>}
    </div>
  );
}

function ValueTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-ink-faint">{formatFull(label ?? "")}</div>
      {payload
        .slice()
        .reverse()
        .map((p) => (
          <div key={p.name} className="flex items-center gap-2 font-mono tabular">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
            <span className="text-ink-muted">{p.name}</span>
            <span className="text-ink">{eurPrecise.format(p.value)}</span>
          </div>
        ))}
    </div>
  );
}

function PerformanceTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-ink-faint">{formatFull(label ?? "")}</div>
      <div className={`font-mono tabular ${v >= 0 ? "text-gain" : "text-loss"}`}>{pct(v, 2)}</div>
    </div>
  );
}

function YearlyReturnTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: { gainEUR: number; returnPct: number } }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const { gainEUR, returnPct } = payload[0].payload;
  const tone = gainEUR >= 0 ? "text-gain" : "text-loss";
  return (
    <div className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-ink-faint">{label}</div>
      <div className={`font-mono tabular ${tone}`}>
        {gainEUR >= 0 ? "+" : ""}
        {eurPrecise.format(gainEUR)}
        <span className="ml-1.5">({pct(returnPct, 1)})</span>
      </div>
    </div>
  );
}

function YearlyReturnLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number; // gainEUR — LabelList's dataKey
  index?: number;
  returns: YearlyReturn[];
}) {
  const { x = 0, y = 0, width = 0, height = 0, value: gainEUR = 0, index = 0, returns } = props;
  const isGain = gainEUR >= 0;
  const returnPct = returns[index]?.returnPct ?? 0;
  const color = isGain ? "var(--gain)" : "var(--loss)";
  const centerX = x + width / 2;

  // EUR line is always the one closer to the bar, % line further out — reads "EUR value, then (%) below it"
  // whether the block sits above a gain bar or below a loss bar.
  const eurY = isGain ? y - 18 : y + height + 14;
  const pctY = isGain ? y - 6 : y + height + 26;

  return (
    <g className="font-mono tabular" fontSize={11} fill={color}>
      <text x={centerX} y={eurY} textAnchor="middle">
        {gainEUR >= 0 ? "+" : ""}
        {eur.format(gainEUR)}
      </text>
      <text x={centerX} y={pctY} textAnchor="middle">
        ({pct(returnPct, 1)})
      </text>
    </g>
  );
}

export default function Dashboard({ series }: { series: PortfolioSeries }) {
  const n = series.dates.length;
  const [performanceRange, setPerformanceRange] = useState<RangeKey>("all");

  const chartData = useMemo(
    () =>
      series.dates.map((date, i) => ({
        date,
        value: series.portfolioValue[i],
        invested: series.netInvested[i],
        performance: series.performancePct[i],
      })),
    [series]
  );

  const performanceStart = n > 0 ? rangeStartDate(series.dates[n - 1], performanceRange) : "0000-00-00";
  const performanceData = useMemo(() => rebasePerformance(chartData, performanceStart), [chartData, performanceStart]);

  const yearlyReturns = useMemo(() => computeYearlyReturns(series), [series]);

  if (n === 0) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-4 px-6 py-10 sm:px-8">
        <h1 className="font-display text-3xl italic text-ink">Portfolio Ledger</h1>
        <p className="text-sm text-ink-muted">No transactions yet — import your DEGIRO history to get started.</p>
        <Link
          href="/import"
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90"
        >
          Import transactions
        </Link>
      </div>
    );
  }

  const currentValue = series.portfolioValue[n - 1];
  const netInvested = series.netInvested[n - 1];
  const totalReturn = currentValue - netInvested;
  const totalReturnPct = series.performancePct[n - 1];
  const gainTone = totalReturn >= 0 ? "gain" : "loss";

  const netInvestedInclDividends = series.netInvestedInclDividends[n - 1];
  const totalReturnInclDividends = currentValue - netInvestedInclDividends;
  const totalReturnInclDividendsPct = series.performancePctInclDividends[n - 1];
  const gainToneInclDividends = totalReturnInclDividends >= 0 ? "gain" : "loss";

  const todayChangeTone = series.todayChangeEUR >= 0 ? "gain" : "loss";
  const performanceIsShortRange = performanceRange === "today" || performanceRange === "week" || performanceRange === "month";

  const totalAllocated = series.holdings.reduce((s, h) => s + h.valueEUR, 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10 sm:px-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl italic text-ink" style={{ textWrap: "balance" }}>
            Portfolio Ledger
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            DEGIRO transactions · {formatFull(series.dates[0])} — {formatFull(series.dates[n - 1])}
          </p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Link
            href="/docs"
            className="flex h-8 items-center rounded-full border border-border px-3.5 text-xs font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
          >
            Docs
          </Link>
          <Link
            href="/dividends"
            className="flex h-8 items-center rounded-full border border-border px-3.5 text-xs font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
          >
            Dividends
          </Link>
          <Link
            href="/import"
            className="flex h-8 items-center rounded-full bg-accent px-3.5 text-xs font-medium text-bg transition-opacity hover:opacity-90"
          >
            Import transactions
          </Link>
          <ThemeToggleSlot />
        </div>
      </header>

      {series.unresolvedIsins.length > 0 && (
        <div className="-mt-6 rounded-lg border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-ink">
          {series.unresolvedIsins.length} holding{series.unresolvedIsins.length === 1 ? "" : "s"} (
          {series.unresolvedIsins.join(", ")}) could not be matched to a price feed and{" "}
          {series.unresolvedIsins.length === 1 ? "is" : "are"} excluded from the charts below. Add a ticker for{" "}
          {series.unresolvedIsins.length === 1 ? "it" : "them"} manually in{" "}
          <code className="rounded bg-bg-inset px-1 py-0.5 text-xs">data/instruments.json</code>.
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="Current value" value={eur.format(currentValue)} />
        <StatTile
          label="Today's change"
          value={`${series.todayChangeEUR >= 0 ? "+" : ""}${eur.format(series.todayChangeEUR)}`}
          sub={pct(series.todayChangePct)}
          tone={todayChangeTone}
        />
        <StatTile label="Net invested" value={eur.format(netInvested)} />
        <StatTile
          label="Total return"
          value={`${totalReturn >= 0 ? "+" : ""}${eur.format(totalReturn)}`}
          sub={pct(totalReturnPct)}
          tone={gainTone}
        />
        <StatTile
          label="Total return (incl. dividends)"
          value={`${totalReturnInclDividends >= 0 ? "+" : ""}${eur.format(totalReturnInclDividends)}`}
          sub={pct(totalReturnInclDividendsPct)}
          tone={gainToneInclDividends}
        />
        <StatTile
          label="Dividends received"
          value={eur.format(series.totalDividendsEUR)}
          sub={`${eur.format(series.dividendsYTDEUR)} this year`}
        />
        <StatTile label="Fees paid" value={eur.format(Math.abs(series.totalFeesEUR))} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg italic text-ink">Value vs. capital invested</h2>
          <Legend
            items={[
              { label: "Portfolio value", color: "var(--accent)" },
              { label: "Net invested", color: "var(--ink-faint)" },
            ]}
          />
        </div>
        <div className="h-80 rounded-lg border border-border bg-bg-elevated pr-4 pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 0, right: 8, bottom: 8, left: 8 }}>
              <defs>
                <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
              <XAxis
                dataKey="date"
                tickFormatter={formatTick}
                stroke="var(--border-strong)"
                tick={{ fill: "var(--ink-faint)", fontSize: 11 }}
                minTickGap={56}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => eur.format(v)}
                stroke="var(--border-strong)"
                tick={{ fill: "var(--ink-faint)", fontSize: 11 }}
                width={72}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ValueTooltip />} />
              <Area
                type="monotone"
                dataKey="invested"
                name="Net invested"
                stroke="var(--ink-faint)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fill="none"
                dot={false}
                activeDot={{ r: 3, fill: "var(--ink-faint)", stroke: "none" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="Portfolio value"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#valueFill)"
                dot={false}
                activeDot={{ r: 3.5, fill: "var(--accent)", stroke: "var(--bg-elevated)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg italic text-ink">Performance over time</h2>
        <div className="h-56 rounded-lg border border-border bg-bg-elevated pr-4 pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={performanceData} margin={{ top: 0, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
              <XAxis
                dataKey="date"
                tickFormatter={performanceIsShortRange ? formatTickShort : formatTick}
                stroke="var(--border-strong)"
                tick={{ fill: "var(--ink-faint)", fontSize: 11 }}
                minTickGap={56}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                stroke="var(--border-strong)"
                tick={{ fill: "var(--ink-faint)", fontSize: 11 }}
                width={48}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine y={0} stroke="var(--border-strong)" strokeWidth={1} />
              <Tooltip content={<PerformanceTooltip />} />
              <Line
                type="monotone"
                dataKey="performance"
                name="Performance"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={
                  performanceData.length <= 10
                    ? { r: 3, fill: "var(--accent)", stroke: "var(--bg-elevated)", strokeWidth: 1.5 }
                    : false
                }
                activeDot={{ r: 3.5, fill: "var(--accent)", stroke: "var(--bg-elevated)", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERFORMANCE_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setPerformanceRange(r.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                performanceRange === r.key
                  ? "bg-accent text-bg"
                  : "border border-border text-ink-muted hover:border-border-strong hover:text-ink"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg italic text-ink">Return by year</h2>
        <div className="h-64 rounded-lg border border-border bg-bg-elevated pr-4 pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={yearlyReturns} margin={{ top: 36, right: 8, bottom: 20, left: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
              <XAxis
                dataKey="label"
                stroke="var(--border-strong)"
                tick={{ fill: "var(--ink-faint)", fontSize: 11 }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => eur.format(v)}
                stroke="var(--border-strong)"
                tick={{ fill: "var(--ink-faint)", fontSize: 11 }}
                width={72}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine y={0} stroke="var(--border-strong)" strokeWidth={1} />
              <Tooltip content={<YearlyReturnTooltip />} cursor={{ fill: "var(--border)", opacity: 0.3 }} />
              <Bar dataKey="gainEUR" name="Return" radius={[3, 3, 3, 3]}>
                {yearlyReturns.map((d) => (
                  <Cell key={d.year} fill={d.gainEUR >= 0 ? "var(--gain)" : "var(--loss)"} />
                ))}
                <LabelList
                  dataKey="gainEUR"
                  content={(props: object) => <YearlyReturnLabel {...props} returns={yearlyReturns} />}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="flex flex-col gap-3 pb-6">
        <h2 className="font-display text-lg italic text-ink">Current holdings</h2>
        <div className="overflow-x-auto rounded-lg border border-border bg-bg-elevated">
          <table className="w-full min-w-[780px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint">
                <th className="px-4 py-3 font-normal">Holding</th>
                <th className="px-4 py-3 text-right font-normal">Units</th>
                <th className="px-4 py-3 text-right font-normal">Value</th>
                <th className="px-4 py-3 text-right font-normal">Today</th>
                <th className="px-4 py-3 text-right font-normal">Dividends</th>
                <th className="px-4 py-3 text-right font-normal">Allocation</th>
              </tr>
            </thead>
            <tbody>
              {series.holdings.map((h) => {
                const alloc = totalAllocated > 0 ? (h.valueEUR / totalAllocated) * 100 : 0;
                const holdingTodayTone = h.todayChangeEUR >= 0 ? "text-gain" : "text-loss";
                return (
                  <tr key={h.isin} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-ink">{h.name}</td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink-muted">
                      {h.units.toLocaleString("en-GB")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink">
                      {eurPrecise.format(h.valueEUR)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono tabular ${holdingTodayTone}`}>
                      {h.todayChangeEUR !== 0 ? (
                        <>
                          {h.todayChangeEUR >= 0 ? "+" : ""}
                          {eurPrecise.format(h.todayChangeEUR)}
                          <span className="ml-1.5 text-xs">({pct(h.todayChangePct, 2)})</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink-muted">
                      {h.dividendsEUR > 0 ? eurPrecise.format(h.dividendsEUR) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-inset">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${alloc}%` }}
                          />
                        </div>
                        <span className="w-11 text-right font-mono tabular text-ink-muted">
                          {alloc.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex items-center gap-4 text-xs text-ink-muted">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
