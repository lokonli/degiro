export function UnresolvedIsinsWarning({ isins }: { isins: string[] }) {
  if (isins.length === 0) return null;
  return (
    <div className="-mt-6 rounded-lg border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-ink">
      {isins.length} holding{isins.length === 1 ? "" : "s"} ({isins.join(", ")}) could not be matched
      to a price feed and {isins.length === 1 ? "is" : "are"} excluded from the charts below. Add a
      ticker for {isins.length === 1 ? "it" : "them"} manually in{" "}
      <code className="rounded bg-bg-inset px-1 py-0.5 text-xs">data/instruments.json</code>.
    </div>
  );
}
