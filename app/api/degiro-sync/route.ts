import { NextResponse } from "next/server";
import { runDegiroSync, readSyncMeta } from "@/lib/degiroSync";

export const runtime = "nodejs";

export async function GET() {
  const meta = await readSyncMeta();
  return NextResponse.json({ meta });
}

export async function POST() {
  try {
    const result = await runDegiroSync({ revalidate: true });
    return NextResponse.json(result);
  } catch (err) {
    console.error("DEGIRO sync failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed." }, { status: 500 });
  }
}
