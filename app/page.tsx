import { computePortfolioSeries } from "@/lib/portfolio";
import Dashboard from "@/components/Dashboard";

export const revalidate = 21600;

export default async function Home() {
  const series = await computePortfolioSeries();
  return <Dashboard series={series} />;
}
