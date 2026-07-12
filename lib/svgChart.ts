export type SvgLinePoint = { x: number; y: number };

export type SvgLineChartOptions = {
  width: number;
  height: number;
  padding: number;
  color: string;
  background: string; // hex color or "transparent"
  strokeWidth: number;
  fill: boolean;
};

/** Renders a single-series line chart (with an implicit zero baseline) as a standalone SVG string. */
export function renderSvgLineChart(values: number[], opts: SvgLineChartOptions): string {
  const { width, height, padding, color, background, strokeWidth, fill } = opts;
  const n = values.length;
  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);

  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;

  const toXY = (i: number, v: number): SvgLinePoint => ({
    x: padding + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW),
    y: padding + innerH - ((v - min) / range) * innerH,
  });

  const points = values.map((v, i) => toXY(i, v));
  const zeroY = padding + innerH - ((0 - min) / range) * innerH;

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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28" />
      <stop offset="100%" stop-color="${color}" stop-opacity="0" />
    </linearGradient>
  </defs>
  ${bgRect}
  <line x1="${padding}" y1="${zeroY.toFixed(2)}" x2="${width - padding}" y2="${zeroY.toFixed(2)}" stroke="${color}" stroke-opacity="0.25" stroke-width="1" stroke-dasharray="3 3" />
  ${fillEl}
  <path d="${linePath}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round" />
</svg>`;
}
