import type { PortfolioSeries } from "@/lib/portfolio";
import { eur, pct } from "./format";
import { StatTile } from "./StatTile";

export function StatsSection({ series }: { series: PortfolioSeries }) {
  const n = series.dates.length;
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

  return (
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
  );
}
