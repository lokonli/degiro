import type { PortfolioSeries } from "@/lib/portfolio";
import { eurPrecise, pct } from "./format";

export function HoldingsTable({ holdings }: { holdings: PortfolioSeries["holdings"] }) {
  const totalAllocated = holdings.reduce((s, h) => s + h.valueEUR, 0);

  return (
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
            {holdings.map((h) => {
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
                        <div className="h-full rounded-full bg-accent" style={{ width: `${alloc}%` }} />
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
  );
}
