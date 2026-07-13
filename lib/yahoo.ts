const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; PortfolioDashboard/1.0)" };

const DAILY_CLOSE_REVALIDATE_SECONDS = 10800; // 3h — EOD data doesn't change more often than once a day
const LIVE_QUOTE_REVALIDATE_SECONDS = 900; // 15m — for "today's change", which should track the market more closely

export type PriceSeries = Map<string, number>; // date (YYYY-MM-DD) -> close price

/**
 * Yahoo intraday timestamps land near market open in the exchange's local
 * timezone, so a plain UTC date conversion is stable for the EU/US venues
 * this app uses.
 */
function tsToDateKey(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

async function fetchChart(symbol: string, range: string, revalidateSeconds = DAILY_CLOSE_REVALIDATE_SECONDS) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: revalidateSeconds } });
  if (!res.ok) throw new Error(`Yahoo chart fetch failed for ${symbol}: ${res.status}`);
  const json = await res.json();
  return json?.chart?.result?.[0];
}

export async function fetchDailyCloses(symbol: string, range = "5y"): Promise<PriceSeries> {
  const result = await fetchChart(symbol, range);
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

export type LiveQuote = { price: number; previousClose: number };

/**
 * Current price vs. the prior trading day's close, for "today's change" figures. Pulled from a small
 * range so `chartPreviousClose` reflects yesterday's actual close — at wide ranges (e.g. the 5y range
 * `fetchDailyCloses` uses) Yahoo returns the close from the *start* of that range instead.
 */
export async function fetchLiveQuote(symbol: string): Promise<LiveQuote | null> {
  const result = await fetchChart(symbol, "5d", LIVE_QUOTE_REVALIDATE_SECONDS);
  const price = result?.meta?.regularMarketPrice;
  const previousClose = result?.meta?.chartPreviousClose ?? result?.meta?.previousClose;
  if (price == null || previousClose == null) return null;
  return { price, previousClose };
}

/** Confirms a symbol has real chartable history and reports its quote currency. */
export async function probeSymbol(symbol: string): Promise<{ currency: string } | null> {
  try {
    const result = await fetchChart(symbol, "1mo");
    if (!result?.timestamp?.length) return null;
    return { currency: result.meta?.currency ?? "EUR" };
  } catch {
    return null;
  }
}

export type YahooQuote = { symbol: string; exchDisp?: string; typeDisp?: string; longname?: string; shortname?: string };

export async function searchYahoo(query: string): Promise<YahooQuote[]> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: YAHOO_HEADERS });
  if (!res.ok) throw new Error(`Yahoo search failed for ${query}: ${res.status}`);
  const json = await res.json();
  return (json?.quotes ?? []) as YahooQuote[];
}
