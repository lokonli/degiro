import transactions from "@/data/transactions.json";
import instruments from "@/data/instruments.json";
import { fetchDailyCloses, type PriceSeries } from "@/lib/yahoo";

export type Transaction = {
  date: string;
  time: string;
  product: string;
  isin: string;
  quantity: number;
  price: number;
  localCurrency: string;
  localValue: number;
  valueEUR: number;
  fees: number;
  totalEUR: number;
};

export type Instrument = { name: string; ticker: string; currency: "EUR" | "USD" };

const txns = transactions as Transaction[];
const instrumentMap = instruments as Record<string, Instrument>;

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

export type HoldingPoint = { isin: string; name: string; units: number; valueEUR: number };

export type PortfolioSeries = {
  dates: string[];
  portfolioValue: number[];
  netInvested: number[];
  performancePct: number[];
  holdings: HoldingPoint[]; // latest snapshot
  totalFeesEUR: number;
  asOf: string;
};

export async function computePortfolioSeries(): Promise<PortfolioSeries> {
  const isins = Array.from(new Set(txns.map((t) => t.isin)));
  const tickers = isins.map((isin) => instrumentMap[isin].ticker);
  const needsFx = isins.some((isin) => instrumentMap[isin].currency === "USD");

  const [priceSeriesList, fxSeries] = await Promise.all([
    Promise.all(tickers.map((t) => fetchDailyCloses(t))),
    needsFx ? fetchDailyCloses("EURUSD=X") : Promise.resolve(new Map<string, number>()),
  ]);

  const pricesByIsin = new Map<string, PriceSeries>();
  isins.forEach((isin, i) => pricesByIsin.set(isin, priceSeriesList[i]));

  const firstTxnDate = txns[0].date;
  const today = new Date().toISOString().slice(0, 10);
  const dates = dateRange(firstTxnDate, today);

  const fxByDate = fxSeries.size > 0 ? forwardFill(dates, fxSeries) : dates.map(() => 1);

  const filledPricesByIsin = new Map<string, number[]>();
  for (const isin of isins) {
    filledPricesByIsin.set(isin, forwardFill(dates, pricesByIsin.get(isin)!));
  }

  const portfolioValue: number[] = new Array(dates.length).fill(0);
  const netInvested: number[] = new Array(dates.length).fill(0);
  const unitsByIsin = new Map<string, number>(isins.map((i) => [i, 0]));
  let cumNetCash = 0;
  let totalFeesEUR = 0;

  let txnIdx = 0;
  for (let d = 0; d < dates.length; d++) {
    const day = dates[d];
    while (txnIdx < txns.length && txns[txnIdx].date === day) {
      const t = txns[txnIdx];
      unitsByIsin.set(t.isin, (unitsByIsin.get(t.isin) ?? 0) + t.quantity);
      cumNetCash += -t.totalEUR;
      totalFeesEUR += t.fees;
      txnIdx++;
    }
    netInvested[d] = cumNetCash;

    let value = 0;
    for (const isin of isins) {
      const units = unitsByIsin.get(isin) ?? 0;
      if (units === 0) continue;
      const currency = instrumentMap[isin].currency;
      const priceLocal = filledPricesByIsin.get(isin)![d];
      const priceEUR = currency === "USD" ? priceLocal / fxByDate[d] : priceLocal;
      value += units * priceEUR;
    }
    portfolioValue[d] = value;
  }

  const performancePct = portfolioValue.map((v, i) =>
    netInvested[i] > 0 ? ((v - netInvested[i]) / netInvested[i]) * 100 : 0
  );

  const lastDay = dates.length - 1;
  const holdings: HoldingPoint[] = isins
    .map((isin) => {
      const units = unitsByIsin.get(isin) ?? 0;
      const currency = instrumentMap[isin].currency;
      const priceLocal = filledPricesByIsin.get(isin)![lastDay];
      const priceEUR = currency === "USD" ? priceLocal / fxByDate[lastDay] : priceLocal;
      return { isin, name: instrumentMap[isin].name, units, valueEUR: units * priceEUR };
    })
    .filter((h) => Math.abs(h.units) > 1e-9)
    .sort((a, b) => b.valueEUR - a.valueEUR);

  return {
    dates,
    portfolioValue,
    netInvested,
    performancePct,
    holdings,
    totalFeesEUR,
    asOf: today,
  };
}
