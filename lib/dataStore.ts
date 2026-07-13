import { promises as fs } from "fs";
import path from "path";
import type { Transaction, InstrumentMap, Dividend } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const TRANSACTIONS_PATH = path.join(DATA_DIR, "transactions.json");
const INSTRUMENTS_PATH = path.join(DATA_DIR, "instruments.json");
const DIVIDENDS_PATH = path.join(DATA_DIR, "dividends.json");

export async function readTransactions(): Promise<Transaction[]> {
  const raw = await fs.readFile(TRANSACTIONS_PATH, "utf-8");
  return JSON.parse(raw) as Transaction[];
}

export async function writeTransactions(txns: Transaction[]): Promise<void> {
  const sorted = [...txns].sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
  );
  await fs.writeFile(TRANSACTIONS_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf-8");
}

export async function readInstruments(): Promise<InstrumentMap> {
  const raw = await fs.readFile(INSTRUMENTS_PATH, "utf-8");
  return JSON.parse(raw) as InstrumentMap;
}

export async function writeInstruments(map: InstrumentMap): Promise<void> {
  await fs.writeFile(INSTRUMENTS_PATH, JSON.stringify(map, null, 2) + "\n", "utf-8");
}

export async function readDividends(): Promise<Dividend[]> {
  const raw = await fs.readFile(DIVIDENDS_PATH, "utf-8");
  return JSON.parse(raw) as Dividend[];
}

export async function writeDividends(dividends: Dividend[]): Promise<void> {
  const sorted = [...dividends].sort((a, b) => a.date.localeCompare(b.date));
  await fs.writeFile(DIVIDENDS_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf-8");
}

/** Stable identity for a transaction row — prefers DEGIRO's order/transaction id. */
export function transactionKey(t: Pick<Transaction, "orderId" | "date" | "time" | "isin" | "quantity" | "price">): string {
  if (t.orderId) return t.orderId;
  return transactionCompositeKey(t);
}

/**
 * Identity based purely on the trade's attributes, ignoring orderId. CSV imports carry DEGIRO's UUID as
 * orderId, while the live API sync carries DEGIRO's numeric transaction id instead — the two id formats
 * never match each other for the same real-world trade, so cross-source dedup must fall back to this.
 */
export function transactionCompositeKey(t: Pick<Transaction, "date" | "time" | "isin" | "quantity" | "price">): string {
  return `${t.date}|${t.time}|${t.isin}|${t.quantity}|${t.price}`;
}
