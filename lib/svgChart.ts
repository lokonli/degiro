export type SvgSeriesPoint = { date: string; value: number };

export type SvgLineChartOptions = {
  width: number;
  height: number;
  padding: number;
  color: string;
  background: string; // hex color or "transparent"
  strokeWidth: number;
  fill: boolean;
  axes: boolean;
  axisColor: string;
};

function formatCompactEur(v: number): string {
  const sign = v < 0 ? "-" : v > 0 ? "+" : "";
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}€${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `${sign}€${Math.round(abs)}`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * min, 0, and max as y-axis ticks. 0 is always shown exactly (this chart always
 * starts there) — min/max are dropped rather than merged when they'd land within
 * 5% of the range of 0, so a barely-negative dip doesn't display as "-€4" in
 * place of a clean "€0".
 */
function pickYTicks(min: number, max: number): number[] {
  const range = max - min || 1;
  const threshold = range * 0.05;
  const ticks = [0];
  if (Math.abs(min) > threshold) ticks.unshift(min);
  if (Math.abs(max) > threshold) ticks.push(max);
  return ticks;
}

const AXIS_FONT_SIZE = 22;

/** Renders a single-series line chart (with an implicit zero baseline) as a standalone SVG string. */
export function renderSvgLineChart(series: SvgSeriesPoint[], opts: SvgLineChartOptions): string {
  const { width, height, padding, color, background, strokeWidth, fill, axes, axisColor } = opts;
  const values = series.map((p) => p.value);
  const n = values.length;

  const leftInset = padding + (axes ? 82 : 0);
  const bottomInset = padding + (axes ? 28 : 0);
  const topInset = padding + (axes ? 12 : 0);
  const rightInset = padding;

  const innerW = Math.max(1, width - leftInset - rightInset);
  const innerH = Math.max(1, height - topInset - bottomInset);

  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;

  const xAt = (i: number) => leftInset + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => topInset + innerH - ((v - min) / range) * innerH;

  const points = values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const zeroY = yAt(0);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

  let fillEl = "";
  if (fill && points.length > 0) {
    const first = points[0];
    const last = points[points.length - 1];
    const fillPath = `M${first.x.toFixed(2)},${zeroY.toFixed(2)} ${points
      .map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ")} L${last.x.toFixed(2)},${zeroY.toFixed(2)} Z`;
    fillEl = `<path d="${fillPath}" fill="url(#fillGrad)" stroke="none" />`;
  }

  const bgRect =
    background === "transparent" ? "" : `<rect width="${width}" height="${height}" fill="${background}" />`;

  let axesEl = "";
  if (axes && n > 0) {
    const yTicks = pickYTicks(min, max);
    const yGridlines = yTicks
      .map((v) => {
        const y = yAt(v).toFixed(2);
        const isZero = v === 0;
        return `<line x1="${leftInset}" y1="${y}" x2="${width - rightInset}" y2="${y}" stroke="${axisColor}" stroke-opacity="${isZero ? 0.35 : 0.15}" stroke-width="1" stroke-dasharray="${isZero ? "none" : "3 3"}" />
        <text x="${leftInset - 10}" y="${y}" dy="0.32em" text-anchor="end" font-size="${AXIS_FONT_SIZE}" font-family="system-ui, sans-serif" fill="${axisColor}">${formatCompactEur(v)}</text>`;
      })
      .join("\n");

    const xTickCount = width >= 500 ? 4 : width >= 320 ? 3 : 2;
    const xIndices = Array.from(
      new Set(
        Array.from({ length: xTickCount }, (_, i) => Math.round((i / (xTickCount - 1 || 1)) * (n - 1)))
      )
    );
    const xTicks = xIndices
      .map((i) => {
        const x = xAt(i);
        const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
        return `<text x="${x.toFixed(2)}" y="${height - bottomInset + 24}" text-anchor="${anchor}" font-size="${AXIS_FONT_SIZE}" font-family="system-ui, sans-serif" fill="${axisColor}">${formatShortDate(series[i].date)}</text>`;
      })
      .join("\n");

    axesEl = `${yGridlines}\n${xTicks}`;
  } else {
    axesEl = `<line x1="${leftInset}" y1="${zeroY.toFixed(2)}" x2="${width - rightInset}" y2="${zeroY.toFixed(2)}" stroke="${color}" stroke-opacity="0.25" stroke-width="1" stroke-dasharray="3 3" />`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28" />
      <stop offset="100%" stop-color="${color}" stop-opacity="0" />
    </linearGradient>
  </defs>
  ${bgRect}
  ${axesEl}
  ${fillEl}
  <path d="${linePath}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round" />
</svg>`;
}
