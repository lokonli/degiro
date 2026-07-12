import { computePortfolioSeries } from "@/lib/portfolio";
import Dashboard from "@/components/Dashboard";

export const revalidate = 10800;

export default async function Home() {
  const series = await computePortfolioSeries();
  return <Dashboard series={series} />;
}
