import { computePortfolioSeries } from "@/lib/portfolio";
import Dashboard from "@/components/Dashboard";

// 15m — bounded by the live-quote fetch's own revalidate window (lib/yahoo.ts), which the "today's
// change" figures need; the EOD history fetches are still cached independently at their own 3h window.
export const revalidate = 900;

export default async function Home() {
  const series = await computePortfolioSeries();
  return <Dashboard series={series} />;
}
