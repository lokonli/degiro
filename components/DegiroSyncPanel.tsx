"use client";

import { useEffect, useState } from "react";

type SyncMeta = {
  lastRunAt: string;
  status: "ok" | "error";
  addedCount?: number;
  error?: string;
};

type SyncResult = {
  addedCount: number;
  duplicateCount: number;
  totalTransactions: number;
  addedDividendCount: number;
  totalDividends: number;
  newInstruments: { isin: string; name: string; ticker: string; currency: string }[];
  unresolvedIsins: { isin: string; name: string }[];
};

type Status = "idle" | "syncing" | "done" | "error";

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

export default function DegiroSyncPanel() {
  const [meta, setMeta] = useState<SyncMeta | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/degiro-sync")
      .then((res) => res.json())
      .then((json) => setMeta(json.meta ?? null))
      .catch(() => {});
  }, []);

  async function handleSync() {
    setStatus("syncing");
    setError(null);
    try {
      const res = await fetch("/api/degiro-sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed.");
      setResult(json as SyncResult);
      setStatus("done");
      setMeta({ lastRunAt: new Date().toISOString(), status: "ok", addedCount: json.addedCount });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-ink-muted">
          {meta ? (
            <>
              Last synced <span className="text-ink">{formatRelative(meta.lastRunAt)}</span>
              {meta.status === "error" && <span className="text-loss"> — last run failed</span>}
              {meta.status === "ok" && typeof meta.addedCount === "number" && (
                <span className="text-ink-faint"> · +{meta.addedCount} that time</span>
              )}
            </>
          ) : (
            "Never synced from the API yet"
          )}
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={status === "syncing"}
          className="shrink-0 rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {status === "syncing" ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {status === "error" && error && (
        <div className="rounded-lg border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-loss">{error}</div>
      )}

      {status === "done" && result && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-bg-elevated px-5 py-4">
            <div className="font-mono text-2xl tabular text-ink">
              {result.addedCount > 0 ? `+${result.addedCount}` : "0"}
            </div>
            <div className="mt-1 text-sm text-ink-muted">
              {result.addedCount > 0
                ? `new transaction${result.addedCount === 1 ? "" : "s"} pulled from DEGIRO`
                : "no new transactions — already up to date"}
            </div>
            <div className="mt-1 text-xs text-ink-faint">{result.totalTransactions} transactions total</div>
            <div className="mt-1 text-xs text-ink-faint">
              {result.addedDividendCount > 0 ? `+${result.addedDividendCount} new dividend${result.addedDividendCount === 1 ? "" : "s"} · ` : ""}
              {result.totalDividends} dividends total
            </div>
          </div>

          {result.newInstruments.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {result.newInstruments.map((i) => (
                <li
                  key={i.isin}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
                >
                  <span className="text-ink">{i.name}</span>
                  <span className="font-mono text-xs tabular text-ink-muted">
                    {i.ticker} · {i.currency}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {result.unresolvedIsins.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {result.unresolvedIsins.map((i) => (
                <li key={i.isin} className="rounded-md border border-loss/30 bg-loss-soft px-3 py-2 text-sm text-ink">
                  {i.name} <span className="font-mono text-xs text-ink-muted">({i.isin})</span> — no price feed matched
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
