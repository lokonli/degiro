import { NextResponse } from "next/server";
import { computePortfolioSeries } from "@/lib/portfolio";

// 15m — bounded by the live-quote fetch's own revalidate window (lib/yahoo.ts), which the "today's
// change" figures need; the EOD history fetches are still cached independently at their own 3h window.
export const revalidate = 900;

export async function GET() {
  try {
    const series = await computePortfolioSeries();
    return NextResponse.json(series);
  } catch (err) {
    console.error("Failed to compute portfolio series", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
