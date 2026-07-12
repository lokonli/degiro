const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; PortfolioDashboard/1.0)" };

export type PriceSeries = Map<string, number>; // date (YYYY-MM-DD) -> close price

/**
 * Yahoo intraday timestamps land near market open in the exchange's local
 * timezone, so a plain UTC date conversion is stable for the EU/US venues
 * this app uses.
 */
function tsToDateKey(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export async function fetchDailyCloses(symbol: string, range = "5y"): Promise<PriceSeries> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: 21600 } });
  if (!res.ok) throw new Error(`Yahoo chart fetch failed for ${symbol}: ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const series: PriceSeries = new Map();
  if (!result?.timestamp) return series;

  const timestamps: number[] = result.timestamp;
  const closes: (number | null)[] = result.indicators?.adjclose?.[0]?.adjclose
    ?? result.indicators?.quote?.[0]?.close
    ?? [];

  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null) continue;
    series.set(tsToDateKey(timestamps[i]), close);
  }
  return series;
}
