import ExcelJS from "exceljs";
import type { Transaction } from "@/lib/types";

export type ParsedRow = Omit<Transaction, "orderId"> & { orderId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ExcelJS cell values can be plain, rich text runs, formula results, or Dates — flatten to a primitive. */
function cellToPlain(value: ExcelJS.CellValue): string | number | Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join("");
    }
    if ("result" in value) return cellToPlain(value.result as ExcelJS.CellValue);
    if ("text" in value) return String((value as { text: unknown }).text);
    return null;
  }
  return typeof value === "boolean" ? String(value) : value;
}

function normHeader(h: unknown): string {
  return String(h ?? "").trim().toLowerCase();
}

function findCol(headers: string[], match: (h: string) => boolean): number {
  return headers.findIndex(match);
}

type ColumnMap = {
  dateCol: number;
  timeCol: number;
  productCol: number;
  isinCol: number;
  quantityCol: number;
  priceCol: number;
  feesCol: number;
  totalCol: number;
};

function buildColumnMap(rawHeaders: unknown[]): ColumnMap {
  const h = rawHeaders.map(normHeader);
  const eq = (name: string) => (s: string) => s === name;
  const includes = (name: string) => (s: string) => s.includes(name);

  const dateCol = findCol(h, (s) => eq("datum")(s) || eq("date")(s));
  const timeCol = findCol(h, (s) => eq("tijd")(s) || eq("time")(s));
  const productCol = findCol(h, includes("product"));
  const isinCol = findCol(h, eq("isin"));
  const quantityCol = findCol(h, (s) => eq("aantal")(s) || includes("quantity")(s) || includes("qty")(s));
  const priceCol = findCol(h, (s) => eq("koers")(s) || eq("price")(s));
  const feesCol = findCol(
    h,
    (s) => includes("transactiekosten")(s) || includes("transaction fee")(s) || includes("transaction cost")(s)
  );
  const totalCol = findCol(h, (s) => includes("totaal")(s) || includes("total")(s));

  const missing = Object.entries({ dateCol, timeCol, productCol, isinCol, quantityCol, priceCol, totalCol })
    .filter(([, v]) => v === -1)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `Could not find expected columns in the file header: ${missing.join(", ")}. ` +
        `Export the "Transactions" overview from DEGIRO (CSV or Excel) and upload it unmodified.`
    );
  }

  return { dateCol, timeCol, productCol, isinCol, quantityCol, priceCol, feesCol, totalCol };
}

function parseNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  if (!s) return 0;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function normDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = new Date(EXCEL_EPOCH + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/); // dd-mm-yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); // yyyy-mm-dd
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return s;
}

function normTime(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(11, 16);
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return s;
}

/** Rows most likely carry DEGIRO's transaction UUID in a trailing, often unlabeled, column. */
function findUuidCol(rows: unknown[][]): number {
  const sample = rows.slice(0, 20);
  const colCount = Math.max(0, ...sample.map((r) => r.length));
  for (let c = colCount - 1; c >= 0; c--) {
    const hits = sample.filter((r) => UUID_RE.test(String(r[c] ?? "").trim())).length;
    if (hits > 0 && hits >= sample.length * 0.5) return c;
  }
  return -1;
}

function rowsToTransactions(headerRow: unknown[], dataRows: unknown[][]): ParsedRow[] {
  const cols = buildColumnMap(headerRow);
  const uuidCol = findUuidCol(dataRows);

  const out: ParsedRow[] = [];
  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    const isin = String(row[cols.isinCol] ?? "").trim();
    const dateRaw = row[cols.dateCol];
    if (!isin || !dateRaw) continue;

    const quantity = parseNumber(row[cols.quantityCol]);
    const price = parseNumber(row[cols.priceCol]);
    const totalEUR = parseNumber(row[cols.totalCol]);
    const fees = cols.feesCol >= 0 ? parseNumber(row[cols.feesCol]) : 0;

    out.push({
      orderId: uuidCol >= 0 ? String(row[uuidCol] ?? "").trim() : "",
      date: normDate(dateRaw),
      time: normTime(row[cols.timeCol]),
      product: String(row[cols.productCol] ?? "").trim(),
      isin,
      quantity,
      price,
      localCurrency: "EUR",
      localValue: totalEUR - fees,
      valueEUR: totalEUR - fees,
      fees,
      totalEUR,
    });
  }
  return out;
}

/** Minimal RFC4180-ish CSV parser: handles quoted fields, escaped quotes, and auto-detects , vs ; delimiter. */
function parseCsv(text: string): unknown[][] {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // ZIP local file header ("PK\x03\x04")

export async function parseDegiroFile(buffer: Buffer): Promise<ParsedRow[]> {
  const isXlsx = buffer.subarray(0, 4).equals(XLSX_MAGIC);

  if (isXlsx) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("The uploaded file has no worksheets.");
    const grid: unknown[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        values[colNumber - 1] = cellToPlain(cell.value);
      });
      grid.push(values);
    });
    if (grid.length < 2) throw new Error("The uploaded file has no data rows.");
    return rowsToTransactions(grid[0], grid.slice(1));
  }

  const text = buffer.toString("utf-8");
  const grid = parseCsv(text);
  if (grid.length < 2) throw new Error("The uploaded file has no data rows.");
  return rowsToTransactions(grid[0], grid.slice(1));
}
