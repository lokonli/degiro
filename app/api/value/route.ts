import { NextResponse } from "next/server";
import { computePortfolioSeries } from "@/lib/portfolio";

// 15m — same window as /api/portfolio, since this reuses the same live-quote fetches.
export const revalidate = 900;

/** Public, unauthenticated: meant to be polled by Home Assistant's REST sensor. */
export async function GET() {
  try {
    const series = await computePortfolioSeries();
    const lastIdx = series.portfolioValue.length - 1;
    if (lastIdx < 0) {
      return NextResponse.json({ error: "No portfolio data yet" }, { status: 404 });
    }

    // portfolioValue[lastIdx] is already live-priced during market hours — Yahoo's daily-close series
    // (lib/yahoo.ts fetchDailyCloses) returns an in-progress bar for "today", not yesterday's finalized
    // close. todayChangeEUR is a *separate* live-vs-previousClose delta, so adding it here would double-count
    // today's move on top of a baseline that already reflects it.
    const valueEUR = series.portfolioValue[lastIdx];

    const weekAgoIdx = Math.max(0, lastIdx - 7);
    const weekAgoValueEUR = series.portfolioValue[weekAgoIdx];
    const weekChangeEUR = valueEUR - weekAgoValueEUR;
    const weekChangePct = weekAgoValueEUR > 0 ? (weekChangeEUR / weekAgoValueEUR) * 100 : 0;

    return NextResponse.json({
      asOf: series.asOf,
      valueEUR: Math.round(valueEUR * 100) / 100,
      todayChangeEUR: Math.round(series.todayChangeEUR * 100) / 100,
      todayChangePct: Math.round(series.todayChangePct * 1000) / 1000,
      weekChangeEUR: Math.round(weekChangeEUR * 100) / 100,
      weekChangePct: Math.round(weekChangePct * 1000) / 1000,
    });
  } catch (err) {
    console.error("Failed to compute /api/value", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
