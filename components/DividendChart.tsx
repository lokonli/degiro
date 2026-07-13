"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eurPrecise = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

function formatTick(date: string) {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function formatFull(date: string) {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-ink-faint">{formatFull(label ?? "")}</div>
      <div className="font-mono tabular text-ink">{eurPrecise.format(payload[0].value)}</div>
    </div>
  );
}

export default function DividendChart({ points }: { points: { date: string; cumulative: number }[] }) {
  return (
    <div className="h-56 rounded-lg border border-border bg-bg-elevated pr-4 pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 0, right: 8, bottom: 8, left: 8 }}>
          <defs>
            <linearGradient id="dividendFill" x1="0" y1="0" x2="0" y2="1">
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
            width={64}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="stepAfter"
            dataKey="cumulative"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#dividendFill)"
            dot={false}
            activeDot={{ r: 3.5, fill: "var(--accent)", stroke: "var(--bg-elevated)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
