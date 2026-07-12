"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";

type ImportResult = {
  addedCount: number;
  duplicateCount: number;
  totalTransactions: number;
  newInstruments: { isin: string; name: string; ticker: string; currency: string }[];
  unresolvedIsins: { isin: string; name: string }[];
};

type Status = "idle" | "selected" | "uploading" | "done" | "error";

export default function ImportForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = useCallback((f: File | null) => {
    if (!f) return;
    setFile(f);
    setStatus("selected");
    setError(null);
    setResult(null);
  }, []);

  async function handleImport() {
    if (!file) return;
    setStatus("uploading");
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed.");
      setResult(json as ImportResult);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setStatus("error");
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError(null);
    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-4">
      {status !== "done" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            pickFile(e.dataTransfer.files?.[0] ?? null);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center transition-colors ${
            dragActive ? "border-accent bg-accent-soft" : "border-border-strong bg-bg-elevated"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <>
              <span className="font-mono text-sm text-ink">{file.name}</span>
              <span className="text-xs text-ink-faint">{(file.size / 1024).toFixed(0)} KB — click to choose a different file</span>
            </>
          ) : (
            <>
              <span className="text-sm text-ink">Drop your DEGIRO export here, or click to browse</span>
              <span className="text-xs text-ink-faint">.csv or .xlsx</span>
            </>
          )}
        </div>
      )}

      {status === "selected" && (
        <button
          type="button"
          onClick={handleImport}
          className="self-start rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90"
        >
          Import transactions
        </button>
      )}

      {status === "uploading" && (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Parsing file and matching new instruments to price feeds…
        </div>
      )}

      {status === "error" && error && (
        <div className="rounded-lg border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-loss">
          {error}
        </div>
      )}

      {status === "error" && (
        <button type="button" onClick={reset} className="self-start text-sm text-ink-muted underline hover:text-ink">
          Try again
        </button>
      )}

      {status === "done" && result && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-bg-elevated px-5 py-4">
            <div className="font-mono text-2xl tabular text-ink">
              {result.addedCount > 0 ? `+${result.addedCount}` : "0"}
            </div>
            <div className="mt-1 text-sm text-ink-muted">
              {result.addedCount > 0
                ? `new transaction${result.addedCount === 1 ? "" : "s"} added`
                : "no new transactions — you're already up to date"}
            </div>
            {result.duplicateCount > 0 && (
              <div className="mt-1 text-xs text-ink-faint">
                {result.duplicateCount} row{result.duplicateCount === 1 ? "" : "s"} already imported, skipped
              </div>
            )}
            <div className="mt-1 text-xs text-ink-faint">{result.totalTransactions} transactions total</div>
          </div>

          {result.newInstruments.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs uppercase tracking-[0.08em] text-ink-faint">
                New instruments auto-matched
              </h3>
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
            </div>
          )}

          {result.unresolvedIsins.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs uppercase tracking-[0.08em] text-loss">Could not auto-match</h3>
              <ul className="flex flex-col gap-1.5">
                {result.unresolvedIsins.map((i) => (
                  <li
                    key={i.isin}
                    className="rounded-md border border-loss/30 bg-loss-soft px-3 py-2 text-sm text-ink"
                  >
                    {i.name} <span className="font-mono text-xs text-ink-muted">({i.isin})</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-ink-faint">
                No tradeable price feed was found for these. They&rsquo;re recorded in your transactions but
                excluded from the value chart until you add a ticker for them manually in{" "}
                <code className="rounded bg-bg-inset px-1 py-0.5">data/instruments.json</code>.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <Link
              href="/"
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90"
            >
              View updated dashboard →
            </Link>
            <button type="button" onClick={reset} className="text-sm text-ink-muted underline hover:text-ink">
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
