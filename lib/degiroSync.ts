import { promises as fs } from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import {
  readTransactions,
  writeTransactions,
  readInstruments,
  writeInstruments,
  transactionCompositeKey,
  readDividends,
  writeDividends,
} from "@/lib/dataStore";
import { resolveInstrument } from "@/lib/instruments";
import { fetchDegiroTransactions, fetchDegiroDividends } from "@/lib/degiroClient";

const SYNC_META_PATH = path.join(process.cwd(), "data", "degiro-sync-meta.json");

export type SyncMeta = {
  lastRunAt: string;
  status: "ok" | "error";
  addedCount?: number;
  error?: string;
};

export type SyncResult = {
  addedCount: number;
  duplicateCount: number;
  totalTransactions: number;
  addedDividendCount: number;
  totalDividends: number;
  newInstruments: { isin: string; name: string; ticker: string; currency: string }[];
  unresolvedIsins: { isin: string; name: string }[];
};

export async function readSyncMeta(): Promise<SyncMeta | null> {
  try {
    const raw = await fs.readFile(SYNC_META_PATH, "utf-8");
    return JSON.parse(raw) as SyncMeta;
  } catch {
    return null;
  }
}

async function writeSyncMeta(meta: SyncMeta): Promise<void> {
  await fs.writeFile(SYNC_META_PATH, JSON.stringify(meta, null, 2) + "\n", "utf-8");
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Logs into DEGIRO, fetches everything since the last known transaction (with a small overlap buffer),
 * and merges genuinely new rows into data/transactions.json — same dedup/instrument-resolution behavior
 * as the CSV import path. `revalidate: true` should only be set from a request context (a route handler);
 * the background daily scheduler runs outside any request and can't call revalidatePath.
 */
export async function runDegiroSync(opts: { revalidate?: boolean } = {}): Promise<SyncResult> {
  try {
    const [existing, instrumentMap, existingDividends] = await Promise.all([
      readTransactions(),
      readInstruments(),
      readDividends(),
    ]);

    const toDate = new Date().toISOString().slice(0, 10);

    const lastDate = existing.reduce((max, t) => (t.date > max ? t.date : max), "2000-01-01");
    const fromDate = shiftDate(lastDate, -3);
    const fetched = await fetchDegiroTransactions(fromDate, toDate);

    // Separate cursor: transactions.json may already hold years of history (from earlier CSV imports)
    // while dividends.json starts empty, so it needs its own from-scratch catch-up window.
    const lastDividendDate = existingDividends.reduce((max, d) => (d.date > max ? d.date : max), "2000-01-01");
    const dividendFromDate = shiftDate(lastDividendDate, -3);
    const fetchedDividends = await fetchDegiroDividends(dividendFromDate, toDate);

    const existingKeys = new Set(existing.map((t) => transactionCompositeKey(t)));
    const added = fetched.filter((row) => {
      const key = transactionCompositeKey(row);
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });

    const newIsins = Array.from(new Set(added.map((t) => t.isin))).filter((isin) => !instrumentMap[isin]);
    const resolvedInstruments: SyncResult["newInstruments"] = [];
    const unresolvedIsins: SyncResult["unresolvedIsins"] = [];

    for (const isin of newIsins) {
      const sampleName = added.find((t) => t.isin === isin)?.product ?? isin;
      const resolved = await resolveInstrument(isin, sampleName);
      if (resolved) {
        instrumentMap[isin] = resolved;
        resolvedInstruments.push({ isin, name: resolved.name, ticker: resolved.ticker, currency: resolved.currency });
      } else {
        unresolvedIsins.push({ isin, name: sampleName });
      }
    }

    const existingDividendIds = new Set(existingDividends.map((d) => d.id));
    const addedDividends = fetchedDividends.filter((d) => {
      if (existingDividendIds.has(d.id)) return false;
      existingDividendIds.add(d.id);
      return true;
    });

    if (added.length > 0 || addedDividends.length > 0) {
      await Promise.all([
        added.length > 0 ? writeTransactions([...existing, ...added]) : Promise.resolve(),
        newIsins.length > 0 ? writeInstruments(instrumentMap) : Promise.resolve(),
        addedDividends.length > 0 ? writeDividends([...existingDividends, ...addedDividends]) : Promise.resolve(),
      ]);
      if (opts.revalidate) {
        revalidatePath("/");
        revalidatePath("/api/portfolio");
        revalidatePath("/api/value");
        revalidatePath("/dividends");
      }
    }

    const result: SyncResult = {
      addedCount: added.length,
      duplicateCount: fetched.length - added.length,
      totalTransactions: existing.length + added.length,
      addedDividendCount: addedDividends.length,
      totalDividends: existingDividends.length + addedDividends.length,
      newInstruments: resolvedInstruments,
      unresolvedIsins,
    };

    await writeSyncMeta({ lastRunAt: new Date().toISOString(), status: "ok", addedCount: added.length });
    return result;
  } catch (err) {
    await writeSyncMeta({
      lastRunAt: new Date().toISOString(),
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

const DAILY_HOUR = 6; // server-local time — exact hour doesn't matter, just "once a day, off-hours"

function msUntilNextRun(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(DAILY_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

let scheduled = false;

/** Called once from instrumentation.ts when the server process starts. */
export function scheduleDailyDegiroSync(): void {
  if (scheduled) return;
  scheduled = true;

  const run = async () => {
    try {
      console.log("[degiro-sync] running scheduled daily sync");
      const result = await runDegiroSync();
      console.log(`[degiro-sync] scheduled sync done: +${result.addedCount} new transaction(s)`);
    } catch (err) {
      console.error("[degiro-sync] scheduled sync failed:", err);
    } finally {
      setTimeout(run, 24 * 60 * 60 * 1000);
    }
  };

  setTimeout(run, msUntilNextRun());
}
