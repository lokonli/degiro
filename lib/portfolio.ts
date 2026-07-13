import { readTransactions, readInstruments, readDividends } from "@/lib/dataStore";
import { fetchDailyCloses, type PriceSeries } from "@/lib/yahoo";

export type { Transaction, Instrument } from "@/lib/types";

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/** Forward-fills a sparse trading-day series across every calendar day. */
function forwardFill(dates: string[], series: PriceSeries): number[] {
  const out: number[] = [];
  let last: number | undefined;
  for (const d of dates) {
    if (series.has(d)) last = series.get(d);
    out.push(last ?? NaN);
  }
  // back-fill any leading NaNs with the first known value
  const firstKnown = out.find((v) => !Number.isNaN(v));
  if (firstKnown !== undefined) {
    for (let i = 0; i < out.length && Number.isNaN(out[i]); i++) out[i] = firstKnown;
  }
  return out;
}

export type HoldingPoint = { isin: string; name: string; units: number; valueEUR: number; dividendsEUR: number };

export type PortfolioSeries = {
  dates: string[];
  portfolioValue: number[];
  netInvested: number[];
  performancePct: number[];
  netInvestedInclDividends: number[];
  performancePctInclDividends: number[];
  totalDividendsEUR: number;
  dividendsYTDEUR: number;
  holdings: HoldingPoint[]; // latest snapshot
  totalFeesEUR: number;
  asOf: string;
  unresolvedIsins: string[]; // holdings excluded from valuation — no ticker mapping yet
};

export async function computePortfolioSeries(): Promise<PortfolioSeries> {
  const [txns, instrumentMap, dividends] = await Promise.all([
    readTransactions(),
    readInstruments(),
    readDividends(),
  ]);
  if (txns.length === 0) {
    return {
      dates: [],
      portfolioValue: [],
      netInvested: [],
      performancePct: [],
      netInvestedInclDividends: [],
      performancePctInclDividends: [],
      totalDividendsEUR: 0,
      dividendsYTDEUR: 0,
      holdings: [],
      totalFeesEUR: 0,
      asOf: new Date().toISOString().slice(0, 10),
      unresolvedIsins: [],
    };
  }

  const allIsins = Array.from(new Set(txns.map((t) => t.isin)));
  const isins = allIsins.filter((isin) => instrumentMap[isin]);
  const unresolvedIsins = allIsins.filter((isin) => !instrumentMap[isin]);
  const tickers = isins.map((isin) => instrumentMap[isin].ticker);

  const foreignCurrencies = Array.from(
    new Set(isins.map((isin) => instrumentMap[isin].currency).filter((c) => c !== "EUR"))
  );

  const [priceSeriesList, fxSeriesList] = await Promise.all([
    Promise.all(tickers.map((t) => fetchDailyCloses(t))),
    Promise.all(foreignCurrencies.map((c) => fetchDailyCloses(`EUR${c}=X`))),
  ]);

  const pricesByIsin = new Map<string, PriceSeries>();
  isins.forEach((isin, i) => pricesByIsin.set(isin, priceSeriesList[i]));

  const firstTxnDate = txns[0].date;
  const today = new Date().toISOString().slice(0, 10);
  const dates = dateRange(firstTxnDate, today);

  // units of foreign currency per 1 EUR, forward-filled per calendar day
  const fxByCurrency = new Map<string, number[]>();
  foreignCurrencies.forEach((c, i) => {
    const series = fxSeriesList[i];
    fxByCurrency.set(c, series.size > 0 ? forwardFill(dates, series) : dates.map(() => 1));
  });

  const filledPricesByIsin = new Map<string, number[]>();
  for (const isin of isins) {
    filledPricesByIsin.set(isin, forwardFill(dates, pricesByIsin.get(isin)!));
  }

  function priceInEurAt(isin: string, dayIdx: number): number {
    const instrument = instrumentMap[isin];
    const raw = filledPricesByIsin.get(isin)![dayIdx] * (instrument.priceScale ?? 1);
    if (instrument.currency === "EUR") return raw;
    const fxRate = fxByCurrency.get(instrument.currency)?.[dayIdx] ?? 1;
    return raw / fxRate;
  }

  const portfolioValue: number[] = new Array(dates.length).fill(0);
  const netInvested: number[] = new Array(dates.length).fill(0);
  const netInvestedInclDividends: number[] = new Array(dates.length).fill(0);
  const unitsByIsin = new Map<string, number>(allIsins.map((i) => [i, 0]));
  let cumNetCash = 0;
  let cumNetCashInclDividends = 0;
  let totalFeesEUR = 0;
  let totalDividendsEUR = 0;

  let txnIdx = 0;
  let divIdx = 0;
  for (let d = 0; d < dates.length; d++) {
    const day = dates[d];
    while (txnIdx < txns.length && txns[txnIdx].date === day) {
      const t = txns[txnIdx];
      unitsByIsin.set(t.isin, (unitsByIsin.get(t.isin) ?? 0) + t.quantity);
      cumNetCash += -t.totalEUR;
      cumNetCashInclDividends += -t.totalEUR;
      totalFeesEUR += t.fees;
      txnIdx++;
    }
    // Dividend cash isn't tracked as a balance anywhere in this model (portfolioValue is holdings-only),
    // so it's folded in the same way a sell's proceeds are: reducing the capital still considered "at risk".
    // That makes performancePctInclDividends a total-return figure without needing to model a cash account.
    while (divIdx < dividends.length && dividends[divIdx].date === day) {
      cumNetCashInclDividends += -dividends[divIdx].netEUR;
      totalDividendsEUR += dividends[divIdx].netEUR;
      divIdx++;
    }
    netInvested[d] = cumNetCash;
    netInvestedInclDividends[d] = cumNetCashInclDividends;

    let value = 0;
    for (const isin of isins) {
      const units = unitsByIsin.get(isin) ?? 0;
      if (units === 0) continue;
      value += units * priceInEurAt(isin, d);
    }
    portfolioValue[d] = value;
  }

  const performancePct = portfolioValue.map((v, i) =>
    netInvested[i] > 0 ? ((v - netInvested[i]) / netInvested[i]) * 100 : 0
  );
  const performancePctInclDividends = portfolioValue.map((v, i) =>
    netInvestedInclDividends[i] > 0 ? ((v - netInvestedInclDividends[i]) / netInvestedInclDividends[i]) * 100 : 0
  );

  const dividendsByIsin = new Map<string, number>();
  for (const div of dividends) {
    dividendsByIsin.set(div.isin, (dividendsByIsin.get(div.isin) ?? 0) + div.netEUR);
  }
  const currentYearStart = `${today.slice(0, 4)}-01-01`;
  const dividendsYTDEUR = dividends
    .filter((d) => d.date >= currentYearStart)
    .reduce((s, d) => s + d.netEUR, 0);

  const lastDay = dates.length - 1;
  const holdings: HoldingPoint[] = isins
    .map((isin) => {
      const units = unitsByIsin.get(isin) ?? 0;
      return {
        isin,
        name: instrumentMap[isin].name,
        units,
        valueEUR: units * priceInEurAt(isin, lastDay),
        dividendsEUR: dividendsByIsin.get(isin) ?? 0,
      };
    })
    .filter((h) => Math.abs(h.units) > 1e-9)
    .sort((a, b) => b.valueEUR - a.valueEUR);

  return {
    dates,
    portfolioValue,
    netInvested,
    performancePct,
    netInvestedInclDividends,
    performancePctInclDividends,
    totalDividendsEUR,
    dividendsYTDEUR,
    holdings,
    totalFeesEUR,
    asOf: today,
    unresolvedIsins,
  };
}
