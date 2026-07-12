import { probeSymbol, searchYahoo, type YahooQuote } from "@/lib/yahoo";
import type { Instrument } from "@/lib/types";

/**
 * Yahoo often returns a same-exchange "ISIN.SG" quote for a fund alongside
 * real exchange-traded symbols. Those ISIN-as-symbol quotes have no chart
 * history, so real ETF/EQUITY listings are tried first.
 */
function rankCandidates(quotes: YahooQuote[], isin: string) {
  const rank = (typeDisp?: string) => {
    if (typeDisp === "ETF") return 0;
    if (typeDisp === "Equity") return 1;
    if (typeDisp === "Fund") return 2;
    return 3;
  };
  return [...quotes]
    .filter((q) => q.symbol && q.symbol.toUpperCase() !== isin.toUpperCase())
    .sort((a, b) => rank(a.typeDisp) - rank(b.typeDisp));
}

export async function resolveInstrument(isin: string, name: string): Promise<Instrument | null> {
  const quotes = await searchYahoo(isin);
  const candidates = rankCandidates(quotes, isin);

  for (const candidate of candidates) {
    const probe = await probeSymbol(candidate.symbol);
    if (!probe) continue;
    // GBp/GBX = pence quotes (1/100 GBP) — common for LSE-listed lines.
    const isPence = probe.currency === "GBp" || probe.currency === "GBX";
    return {
      name: candidate.longname || candidate.shortname || name,
      ticker: candidate.symbol,
      currency: isPence ? "GBP" : probe.currency,
      ...(isPence ? { priceScale: 0.01 } : {}),
    };
  }
  return null;
}
