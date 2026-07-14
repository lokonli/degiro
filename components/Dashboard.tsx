"use client";

import { useMemo } from "react";
import type { PortfolioSeries } from "@/lib/portfolio";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { HoldingsTable } from "@/components/dashboard/HoldingsTable";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { StatsSection } from "@/components/dashboard/StatsSection";
import { UnresolvedIsinsWarning } from "@/components/dashboard/UnresolvedIsinsWarning";
import { ValueChart } from "@/components/dashboard/ValueChart";
import { YearlyReturnsChart } from "@/components/dashboard/YearlyReturnsChart";
import type { ChartPoint } from "@/components/dashboard/types";

export default function Dashboard({ series }: { series: PortfolioSeries }) {
  const n = series.dates.length;

  const chartData: ChartPoint[] = useMemo(
    () =>
      series.dates.map((date, i) => ({
        date,
        value: series.portfolioValue[i],
        invested: series.netInvested[i],
        performance: series.performancePct[i],
      })),
    [series]
  );

  if (n === 0) {
    return <EmptyState />;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10 sm:px-8">
      <DashboardHeader firstDate={series.dates[0]} lastDate={series.dates[n - 1]} />
      <UnresolvedIsinsWarning isins={series.unresolvedIsins} />
      <StatsSection series={series} />
      <ValueChart chartData={chartData} />
      <PerformanceChart chartData={chartData} lastDateIso={series.dates[n - 1]} />
      <YearlyReturnsChart series={series} />
      <HoldingsTable holdings={series.holdings} />
    </div>
  );
}
