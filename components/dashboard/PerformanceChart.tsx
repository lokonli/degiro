"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatFull, formatTick, formatTickShort, pct } from "./format";
import type { ChartPoint } from "./types";

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
    const p = d.invested > 0 ? (incrementalGain / d.invested) * 100 : 0;
    return { ...d, performance: p };
  });
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

export function PerformanceChart({ chartData, lastDateIso }: { chartData: ChartPoint[]; lastDateIso: string }) {
  const [performanceRange, setPerformanceRange] = useState<RangeKey>("all");

  const performanceStart = rangeStartDate(lastDateIso, performanceRange);
  const performanceData = useMemo(
    () => rebasePerformance(chartData, performanceStart),
    [chartData, performanceStart]
  );
  const performanceIsShortRange =
    performanceRange === "today" || performanceRange === "week" || performanceRange === "month";

  return (
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
  );
}
