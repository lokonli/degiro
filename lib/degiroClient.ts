import crypto from "crypto";
import type { Transaction } from "@/lib/types";

const LOGIN_URL = "https://trader.degiro.nl/login/secure/login";
const CLIENT_DETAILS_URL = "https://trader.degiro.nl/pa/secure/client";
const TRANSACTIONS_HISTORY_URL = "https://trader.degiro.nl/portfolio-reports/secure/v4/transactions";
const PRODUCTS_INFO_URL = "https://trader.degiro.nl/product_search/secure/v5/products/info";

const REQUEST_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json;charset=UTF-8",
  Origin: "https://trader.degiro.nl",
  Referer: "https://trader.degiro.nl/trader",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238 TOTP: SHA1, 30s step, 6 digits — matches DEGIRO/Google Authenticator defaults. */
function generateTotp(secretBase32: string): string {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

async function degiroLogin(): Promise<string> {
  const username = requireEnv("DEGIRO_USERNAME");
  const password = requireEnv("DEGIRO_PASSWORD");
  const totpSecret = requireEnv("DEGIRO_TOTP_SECRET");

  const res = await fetch(`${LOGIN_URL}/totp`, {
    method: "POST",
    headers: REQUEST_HEADERS,
    body: JSON.stringify({
      username,
      password,
      isPassCodeReset: false,
      isRedirectToMobile: false,
      queryTarams: {},
      oneTimePassword: generateTotp(totpSecret),
    }),
  });

  const json = await res.json().catch(() => ({}) as Record<string, unknown>);
  const sessionId = (json as { sessionId?: string }).sessionId;
  if (res.status !== 200 || !sessionId) {
    const statusText = (json as { statusText?: string; status?: number }).statusText;
    throw new Error(`DEGIRO login failed: ${statusText ?? `HTTP ${res.status}`}`);
  }
  return sessionId;
}

async function getIntAccount(sessionId: string): Promise<number> {
  const url = `${CLIENT_DETAILS_URL}?sessionId=${encodeURIComponent(sessionId)}`;
  const res = await fetch(url, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`DEGIRO client details failed: HTTP ${res.status}`);
  const json = await res.json();
  const intAccount = json?.data?.intAccount;
  if (!intAccount) throw new Error("DEGIRO client details response had no intAccount.");
  return intAccount as number;
}

function toDdMmYyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

type HistoryItem = {
  id: number;
  date: string;
  buysell?: string;
  price?: number;
  quantity?: number;
  productId?: number;
  total?: number;
  totalInBaseCurrency?: number;
  feeInBaseCurrency?: number;
  totalFeesInBaseCurrency?: number;
};

async function getTransactionsHistory(
  sessionId: string,
  intAccount: number,
  fromDate: string,
  toDate: string
): Promise<HistoryItem[]> {
  const params = new URLSearchParams({
    fromDate: toDdMmYyyy(fromDate),
    toDate: toDdMmYyyy(toDate),
    groupTransactionsByOrder: "false",
    intAccount: String(intAccount),
    sessionId,
  });
  const res = await fetch(`${TRANSACTIONS_HISTORY_URL}?${params}`, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`DEGIRO transactions history failed: HTTP ${res.status}`);
  const json = await res.json();
  return (json?.data ?? []) as HistoryItem[];
}

type ProductItem = { isin?: string; name?: string };

async function getProductsInfo(
  sessionId: string,
  intAccount: number,
  productIds: number[]
): Promise<Map<number, ProductItem>> {
  const map = new Map<number, ProductItem>();
  if (productIds.length === 0) return map;
  const params = new URLSearchParams({ intAccount: String(intAccount), sessionId });
  const res = await fetch(`${PRODUCTS_INFO_URL}?${params}`, {
    method: "POST",
    headers: REQUEST_HEADERS,
    body: JSON.stringify(productIds),
  });
  if (!res.ok) throw new Error(`DEGIRO products info failed: HTTP ${res.status}`);
  const json = await res.json();
  for (const [id, item] of Object.entries(json?.data ?? {})) {
    map.set(Number(id), item as ProductItem);
  }
  return map;
}

/** DEGIRO's history timestamps carry a UTC offset; the CSV export (and this app's dates) use Amsterdam local time. */
function toAmsterdamDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return { date, time };
}

/** Fetches buy/sell transactions in [fromDate, toDate] (inclusive, "YYYY-MM-DD") and maps them to this app's Transaction shape. */
export async function fetchDegiroTransactions(fromDate: string, toDate: string): Promise<Transaction[]> {
  const sessionId = await degiroLogin();
  const intAccount = await getIntAccount(sessionId);
  const history = await getTransactionsHistory(sessionId, intAccount, fromDate, toDate);
  if (history.length === 0) return [];

  const productIds = Array.from(new Set(history.map((h) => h.productId).filter((id): id is number => id != null)));
  const products = await getProductsInfo(sessionId, intAccount, productIds);

  const out: Transaction[] = [];
  for (const item of history) {
    if (item.productId == null) continue;
    const product = products.get(item.productId);
    if (!product?.isin) continue; // no ISIN to key this position on — skip rather than guess

    let quantity = item.quantity ?? 0;
    if (item.buysell === "S" && quantity > 0) quantity = -quantity;
    if (item.buysell === "B" && quantity < 0) quantity = -quantity;

    const totalEUR = item.totalInBaseCurrency ?? item.total ?? 0;
    const fees = Math.abs(item.totalFeesInBaseCurrency ?? item.feeInBaseCurrency ?? 0);
    const { date, time } = toAmsterdamDateTime(item.date);

    out.push({
      orderId: String(item.id),
      date,
      time,
      product: product.name ?? product.isin,
      isin: product.isin,
      quantity,
      price: item.price ?? 0,
      localCurrency: "EUR",
      localValue: totalEUR - fees,
      valueEUR: totalEUR - fees,
      fees,
      totalEUR,
    });
  }
  return out;
}
