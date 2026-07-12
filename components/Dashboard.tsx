"use client";

import dynamic from "next/dynamic";
import {
  Area,
  AreaChart,
  CartesianGrid,
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

export default function Dashboard({ series }: { series: PortfolioSeries }) {
  const n = series.dates.length;
  const currentValue = series.portfolioValue[n - 1];
  const netInvested = series.netInvested[n - 1];
  const totalReturn = currentValue - netInvested;
  const totalReturnPct = series.performancePct[n - 1];
  const gainTone = totalReturn >= 0 ? "gain" : "loss";

  const chartData = series.dates.map((date, i) => ({
    date,
    value: series.portfolioValue[i],
    invested: series.netInvested[i],
    performance: series.performancePct[i],
  }));

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
        <div className="pt-1">
          <ThemeToggleSlot />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Current value" value={eur.format(currentValue)} />
        <StatTile label="Net invested" value={eur.format(netInvested)} />
        <StatTile
          label="Total return"
          value={`${totalReturn >= 0 ? "+" : ""}${eur.format(totalReturn)}`}
          sub={pct(totalReturnPct)}
          tone={gainTone}
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
            <LineChart data={chartData} margin={{ top: 0, right: 8, bottom: 8, left: 8 }}>
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
                dot={false}
                activeDot={{ r: 3.5, fill: "var(--accent)", stroke: "var(--bg-elevated)", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="flex flex-col gap-3 pb-6">
        <h2 className="font-display text-lg italic text-ink">Current holdings</h2>
        <div className="overflow-x-auto rounded-lg border border-border bg-bg-elevated">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint">
                <th className="px-4 py-3 font-normal">Holding</th>
                <th className="px-4 py-3 text-right font-normal">Units</th>
                <th className="px-4 py-3 text-right font-normal">Value</th>
                <th className="px-4 py-3 text-right font-normal">Allocation</th>
              </tr>
            </thead>
            <tbody>
              {series.holdings.map((h) => {
                const alloc = totalAllocated > 0 ? (h.valueEUR / totalAllocated) * 100 : 0;
                return (
                  <tr key={h.isin} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-ink">{h.name}</td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink-muted">
                      {h.units.toLocaleString("en-GB")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink">
                      {eurPrecise.format(h.valueEUR)}
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
