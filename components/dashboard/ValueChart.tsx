import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { eur, eurPrecise, formatFull, formatTick } from "./format";
import { Legend } from "./Legend";
import type { ChartPoint } from "./types";

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

export function ValueChart({ chartData }: { chartData: ChartPoint[] }) {
  return (
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
  );
}
