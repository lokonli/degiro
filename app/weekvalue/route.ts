import { computePortfolioSeries } from "@/lib/portfolio";
import { renderSvgLineChart } from "@/lib/svgChart";

export const runtime = "nodejs";
export const revalidate = 0; // always reflect the current query params; portfolio data itself is cached upstream

const GAIN_COLOR = "#1e7a4c";
const LOSS_COLOR = "#b23a34";
const DEFAULT_AXIS_COLOR = "#888888";

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw != null ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function isHexColor(v: string | null): v is string {
  return !!v && /^#?[0-9a-fA-F]{3,8}$/.test(v);
}

function normalizeColor(v: string | null): string | null {
  if (!isHexColor(v)) return null;
  return v!.startsWith("#") ? v! : `#${v}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const days = clampInt(searchParams.get("days"), 7, 1, 3650);
  const width = clampInt(searchParams.get("width"), 600, 50, 4000);
  const height = clampInt(searchParams.get("height"), 200, 50, 2000);
  const padding = clampInt(searchParams.get("padding"), 12, 0, 200);
  const strokeWidthRaw = parseFloat(searchParams.get("strokeWidth") ?? "");
  const strokeWidth = Number.isFinite(strokeWidthRaw) ? Math.min(20, Math.max(0.5, strokeWidthRaw)) : 2.5;
  const fill = searchParams.get("fill") !== "false";
  const axes = searchParams.get("axes") !== "false";
  const axisColor = normalizeColor(searchParams.get("axisColor")) ?? DEFAULT_AXIS_COLOR;
  const bgParam = searchParams.get("bg");
  const background = bgParam === "transparent" || bgParam === null ? "transparent" : (normalizeColor(bgParam) ?? "transparent");
  const colorOverride = normalizeColor(searchParams.get("color"));

  const portfolio = await computePortfolioSeries();
  const n = portfolio.dates.length;

  if (n === 0) {
    const today = new Date().toISOString().slice(0, 10);
    const svg = renderSvgLineChart(
      [
        { date: today, value: 0 },
        { date: today, value: 0 },
      ],
      { width, height, padding, color: colorOverride ?? GAIN_COLOR, background, strokeWidth, fill, axes, axisColor }
    );
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
  }

  const startIdx = Math.max(0, n - days);
  const windowedDates = portfolio.dates.slice(startIdx);
  const windowedValues = portfolio.portfolioValue.slice(startIdx);
  const startValue = windowedValues[0];
  const series = windowedDates.map((date, i) => ({ date, value: windowedValues[i] - startValue }));
  const color = colorOverride ?? (series[series.length - 1].value >= 0 ? GAIN_COLOR : LOSS_COLOR);

  const svg = renderSvgLineChart(series, { width, height, padding, color, background, strokeWidth, fill, axes, axisColor });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
    },
  });
}
