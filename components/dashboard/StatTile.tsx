export function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "gain" | "loss" | "neutral";
}) {
  const subColor =
    tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-ink-muted";
  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-5 py-4">
      <div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">{label}</div>
      <div className="mt-1.5 font-mono text-2xl tabular text-ink">{value}</div>
      {sub && <div className={`mt-1 font-mono text-xs tabular ${subColor}`}>{sub}</div>}
    </div>
  );
}
