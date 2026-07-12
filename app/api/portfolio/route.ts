import { NextResponse } from "next/server";
import { computePortfolioSeries } from "@/lib/portfolio";

export const revalidate = 21600; // 6h — daily EOD data doesn't need to be fetched more often

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
