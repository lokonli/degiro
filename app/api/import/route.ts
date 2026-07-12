import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { parseDegiroFile } from "@/lib/parseDegiro";
import { readTransactions, writeTransactions, readInstruments, writeInstruments, transactionKey } from "@/lib/dataStore";
import { resolveInstrument } from "@/lib/instruments";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File too large (max 10MB)." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let parsed;
    try {
      parsed = await parseDegiroFile(buffer);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not parse file." },
        { status: 400 }
      );
    }
    if (parsed.length === 0) {
      return NextResponse.json({ error: "No transactions found in that file." }, { status: 400 });
    }

    const [existing, instrumentMap] = await Promise.all([readTransactions(), readInstruments()]);
    const existingKeys = new Set(existing.map((t) => transactionKey(t)));

    const added = parsed.filter((row) => {
      const key = transactionKey(row);
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });

    const newIsins = Array.from(new Set(added.map((t) => t.isin))).filter((isin) => !instrumentMap[isin]);
    const resolvedInstruments: { isin: string; name: string; ticker: string; currency: string }[] = [];
    const unresolvedIsins: { isin: string; name: string }[] = [];

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

    if (added.length > 0) {
      await Promise.all([
        writeTransactions([...existing, ...added]),
        newIsins.length > 0 ? writeInstruments(instrumentMap) : Promise.resolve(),
      ]);
      revalidatePath("/");
      revalidatePath("/api/portfolio");
    }

    return NextResponse.json({
      addedCount: added.length,
      duplicateCount: parsed.length - added.length,
      totalTransactions: existing.length + added.length,
      newInstruments: resolvedInstruments,
      unresolvedIsins,
    });
  } catch (err) {
    console.error("Import failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed." }, { status: 500 });
  }
}
