import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PortfolioSeries } from "@/lib/portfolio";
import { eur, eurPrecise, pct } from "./format";

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

export function YearlyReturnsChart({ series }: { series: PortfolioSeries }) {
  const yearlyReturns = useMemo(() => computeYearlyReturns(series), [series]);

  return (
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
  );
}
