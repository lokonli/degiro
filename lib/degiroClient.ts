import crypto from "crypto";
import type { Transaction, Dividend } from "@/lib/types";

const LOGIN_URL = "https://trader.degiro.nl/login/secure/login";
const CLIENT_DETAILS_URL = "https://trader.degiro.nl/pa/secure/client";
const TRANSACTIONS_HISTORY_URL = "https://trader.degiro.nl/portfolio-reports/secure/v4/transactions";
const ACCOUNT_OVERVIEW_URL = "https://trader.degiro.nl/portfolio-reports/secure/v6/accountoverview";
const PRODUCTS_INFO_URL = "https://trader.degiro.nl/product_search/secure/v5/products/info";
const PORTFOLIO_UPDATE_URL = "https://trader.degiro.nl/trading/secure/v5/update";

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

/** Thrown when a DEGIRO endpoint rejects the current session (expired/invalid) — callers should re-login once and retry. */
export class DegiroSessionExpiredError extends Error {}

function checkSessionResponse(res: Response, label: string): void {
  if (res.status === 401 || res.status === 403) {
    throw new DegiroSessionExpiredError(`${label}: session expired (HTTP ${res.status})`);
  }
  if (!res.ok) throw new Error(`${label} failed: HTTP ${res.status}`);
}

type DegiroSession = { sessionId: string; intAccount: number };

// Module-level session cache: every exported call used to log in fresh (fine at once/day, not at
// live-polling cadence). `sessionInFlight` also dedupes concurrent logins onto one in-flight request,
// which matters because two logins within the same 30s TOTP window would submit the same one-time code.
let cachedSession: DegiroSession | null = null;
let sessionInFlight: Promise<DegiroSession> | null = null;

async function loginFresh(): Promise<DegiroSession> {
  const sessionId = await degiroLogin();
  const intAccount = await getIntAccount(sessionId);
  return { sessionId, intAccount };
}

async function getDegiroSession(forceRefresh = false): Promise<DegiroSession> {
  if (!forceRefresh && cachedSession) return cachedSession;
  if (sessionInFlight) return sessionInFlight;

  sessionInFlight = loginFresh()
    .then((session) => {
      cachedSession = session;
      return session;
    })
    .catch((err) => {
      cachedSession = null;
      throw err;
    })
    .finally(() => {
      sessionInFlight = null;
    });
  return sessionInFlight;
}

/** Runs `fn` with the cached session, re-logging in once and retrying if the session turns out to be expired. */
async function withSession<T>(fn: (session: DegiroSession) => Promise<T>): Promise<T> {
  const session = await getDegiroSession();
  try {
    return await fn(session);
  } catch (err) {
    if (err instanceof DegiroSessionExpiredError) {
      const fresh = await getDegiroSession(true);
      return fn(fresh);
    }
    throw err;
  }
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
  checkSessionResponse(res, "DEGIRO transactions history");
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
  checkSessionResponse(res, "DEGIRO products info");
  const json = await res.json();
  for (const [id, item] of Object.entries(json?.data ?? {})) {
    map.set(Number(id), item as ProductItem);
  }
  return map;
}

/** Resolves DEGIRO product ids to `{isin, name}`, handling session login/retry itself. */
export async function getDegiroProductsInfo(productIds: number[]): Promise<Map<number, ProductItem>> {
  if (productIds.length === 0) return new Map();
  return withSession(({ sessionId, intAccount }) => getProductsInfo(sessionId, intAccount, productIds));
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

type CashMovement = {
  id: number;
  valueDate: string;
  description?: string;
  productId?: number;
  change?: number;
};

async function getAccountOverview(
  sessionId: string,
  intAccount: number,
  fromDate: string,
  toDate: string
): Promise<CashMovement[]> {
  const params = new URLSearchParams({
    fromDate: toDdMmYyyy(fromDate),
    toDate: toDdMmYyyy(toDate),
    intAccount: String(intAccount),
    sessionId,
  });
  const res = await fetch(`${ACCOUNT_OVERVIEW_URL}?${params}`, { headers: REQUEST_HEADERS });
  checkSessionResponse(res, "DEGIRO account overview");
  const json = await res.json();
  return (json?.data?.cashMovements ?? []) as CashMovement[];
}

/**
 * Fetches dividend cash movements in [fromDate, toDate] (inclusive, "YYYY-MM-DD"). DEGIRO records each
 * payout as two separate cash-movement rows sharing the same product/value-date: a "Dividend" credit and
 * a "Dividendbelasting" (withholding tax) debit — these are paired here into one net Dividend per payout.
 */
export async function fetchDegiroDividends(fromDate: string, toDate: string): Promise<Dividend[]> {
  return withSession(async ({ sessionId, intAccount }) => {
    const movements = await getAccountOverview(sessionId, intAccount, fromDate, toDate);

    const dividendMovements = movements.filter((m) => m.productId != null && /dividend/i.test(m.description ?? ""));
    if (dividendMovements.length === 0) return [];

    const productIds = Array.from(new Set(dividendMovements.map((m) => m.productId!)));
    const products = await getProductsInfo(sessionId, intAccount, productIds);

    type Group = { productId: number; valueDate: string; gross: CashMovement | null; taxEUR: number };
    const groups = new Map<string, Group>();
    for (const m of dividendMovements) {
      const key = `${m.productId}|${m.valueDate}`;
      const group = groups.get(key) ?? { productId: m.productId!, valueDate: m.valueDate, gross: null, taxEUR: 0 };
      if (/belasting|tax/i.test(m.description ?? "")) {
        group.taxEUR += Math.abs(m.change ?? 0);
      } else {
        group.gross = m;
      }
      groups.set(key, group);
    }

    const out: Dividend[] = [];
    for (const group of groups.values()) {
      if (!group.gross) continue; // a tax row with no matching gross entry in this window — nothing to attribute it to
      const product = products.get(group.productId);
      if (!product?.isin) continue; // no ISIN to key this position on — skip rather than guess
      const grossEUR = group.gross.change ?? 0;
      const { date } = toAmsterdamDateTime(group.gross.valueDate);
      out.push({
        id: String(group.gross.id),
        date,
        isin: product.isin,
        product: product.name ?? product.isin,
        grossEUR,
        taxEUR: group.taxEUR,
        netEUR: grossEUR - group.taxEUR,
      });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  });
}

export type DegiroTransactionsResult = {
  transactions: Transaction[];
  isinToDegiroId: Map<string, string>;
};

/** Fetches buy/sell transactions in [fromDate, toDate] (inclusive, "YYYY-MM-DD") and maps them to this app's Transaction shape. */
export async function fetchDegiroTransactions(fromDate: string, toDate: string): Promise<DegiroTransactionsResult> {
  return withSession(async ({ sessionId, intAccount }) => {
    const history = await getTransactionsHistory(sessionId, intAccount, fromDate, toDate);
    if (history.length === 0) return { transactions: [], isinToDegiroId: new Map() };

    const productIds = Array.from(new Set(history.map((h) => h.productId).filter((id): id is number => id != null)));
    const products = await getProductsInfo(sessionId, intAccount, productIds);

    const out: Transaction[] = [];
    const isinToDegiroId = new Map<string, string>();
    for (const item of history) {
      if (item.productId == null) continue;
      const product = products.get(item.productId);
      if (!product?.isin) continue; // no ISIN to key this position on — skip rather than guess
      isinToDegiroId.set(product.isin, String(item.productId));

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
    return { transactions: out, isinToDegiroId };
  });
}

type PortfolioField = { name: string; value?: unknown };
type PortfolioRow = { name: string; id?: string; value: PortfolioField[] };

function unpackFields(fields: PortfolioField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f.name] = f.value;
  return out;
}

async function getPortfolioUpdate(
  sessionId: string,
  intAccount: number
): Promise<{ portfolioRows: PortfolioRow[]; totalFields: Record<string, unknown> }> {
  const url = `${PORTFOLIO_UPDATE_URL}/${intAccount};jsessionid=${sessionId}?portfolio=0&totalPortfolio=0`;
  const res = await fetch(url, { headers: { ...REQUEST_HEADERS, Cookie: `JSESSIONID=${sessionId}` } });
  checkSessionResponse(res, "DEGIRO portfolio update");
  const json = await res.json();
  const portfolioRows = (json?.portfolio?.value ?? []) as PortfolioRow[];
  const totalFields = unpackFields((json?.totalPortfolio?.value ?? []) as PortfolioField[]);
  return { portfolioRows, totalFields };
}

export type DegiroLivePosition = { degiroId: string; size: number; priceEUR: number; valueEUR: number };
export type DegiroLivePortfolio = { positions: DegiroLivePosition[]; totalCashEUR: number; fetchedAt: string };

/** Live positions + cash straight from DEGIRO's own trading feed. `priceEUR`/`valueEUR` are already EUR-converted by DEGIRO. */
async function fetchDegiroLivePortfolioUncached(): Promise<DegiroLivePortfolio> {
  return withSession(async ({ sessionId, intAccount }) => {
    const { portfolioRows, totalFields } = await getPortfolioUpdate(sessionId, intAccount);
    const positions: DegiroLivePosition[] = [];
    for (const row of portfolioRows) {
      const fields = unpackFields(row.value);
      if (fields.positionType !== "PRODUCT") continue;
      const size = Number(fields.size ?? 0);
      if (size === 0) continue; // not currently held
      positions.push({
        degiroId: String(fields.id ?? row.id ?? ""),
        size,
        priceEUR: Number(fields.price ?? 0),
        valueEUR: Number(fields.value ?? 0),
      });
    }
    return { positions, totalCashEUR: Number(totalFields.totalCash ?? 0), fetchedAt: new Date().toISOString() };
  });
}

// TTL matches this app's existing Yahoo live-quote cadence (lib/yahoo.ts LIVE_QUOTE_REVALIDATE_SECONDS) —
// DEGIRO's rate limits for this kind of frequent polling aren't documented anywhere, so this deliberately
// doesn't poll any more often than the app already did against Yahoo. `liveInFlight` dedupes concurrent
// callers (e.g. /api/value, /api/portfolio, /weekvalue all resolving within the same window) onto one
// DEGIRO round trip. After repeated failures, a cooldown skips DEGIRO entirely for a while rather than
// retry-storming a possibly rate-limited or locked-out account.
const LIVE_PORTFOLIO_TTL_MS = 900_000;
const LIVE_PORTFOLIO_FAILURE_THRESHOLD = 3;
const LIVE_PORTFOLIO_FAILURE_COOLDOWN_MS = 10 * 60_000;

let liveCache: { data: DegiroLivePortfolio; fetchedAtMs: number } | null = null;
let liveInFlight: Promise<DegiroLivePortfolio> | null = null;
let consecutiveFailures = 0;
let cooldownUntilMs = 0;

/** Never throws — returns null on any failure so callers can fall back to another price source. */
export async function getCachedDegiroLivePortfolio(): Promise<DegiroLivePortfolio | null> {
  const now = Date.now();
  if (liveCache && now - liveCache.fetchedAtMs < LIVE_PORTFOLIO_TTL_MS) return liveCache.data;
  if (now < cooldownUntilMs) return null;

  if (liveInFlight) {
    try {
      return await liveInFlight;
    } catch {
      return null;
    }
  }

  liveInFlight = fetchDegiroLivePortfolioUncached();
  try {
    const data = await liveInFlight;
    liveCache = { data, fetchedAtMs: Date.now() };
    consecutiveFailures = 0;
    cooldownUntilMs = 0;
    return data;
  } catch (err) {
    consecutiveFailures++;
    if (consecutiveFailures >= LIVE_PORTFOLIO_FAILURE_THRESHOLD) {
      cooldownUntilMs = Date.now() + LIVE_PORTFOLIO_FAILURE_COOLDOWN_MS;
    }
    console.error("[degiroClient] live portfolio fetch failed", err);
    return null;
  } finally {
    liveInFlight = null;
  }
}
