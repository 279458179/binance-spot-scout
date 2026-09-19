/**
 * Pure parsers turning raw Binance REST payloads into typed market data.
 *
 * Binance sends numbers as strings (and klines as positional arrays), so every
 * value crossing this boundary is coerced exactly once, here. Anything that
 * fails to coerce throws a `BinanceError` with `DATA_UNAVAILABLE` — the scan
 * must never score a `NaN` and call it a trade.
 */

import type { BookTicker, Kline, SymbolInfo, Ticker24h } from "@/shared/types";
import { QUOTE_ASSET } from "@/config/strategy";
import { BinanceError } from "./errors";

function fail(endpoint: string, detail: string): never {
  throw new BinanceError(`malformed payload: ${detail}`, {
    code: "DATA_UNAVAILABLE",
    endpoint,
  });
}

function asRecord(value: unknown, endpoint: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(endpoint, "expected an object");
  }
  return value as Record<string, unknown>;
}

/** Coerces a Binance numeric field, accepting both strings and numbers. */
function num(value: unknown, endpoint: string, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fail(endpoint, `field "${field}" is not a finite number`);
}

function str(value: unknown, endpoint: string, field: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  return fail(endpoint, `field "${field}" is not a non-empty string`);
}

/** Binance `Retry-After` may be seconds or milliseconds. Normalises to ms. */
export function parseRetryAfterMs(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  // Values below 1000 are always seconds; Binance has never used sub-second
  // Retry-After, so treating small numbers as milliseconds would be wrong.
  return parsed < 1_000 ? Math.round(parsed * 1_000) : Math.round(parsed);
}

/**
 * Parses a `/api/v3/klines` array.
 *
 * Positional layout (verified against the live API):
 * `[openTime, open, high, low, close, volume, closeTime, quoteVolume, trades,
 * takerBuyBase, takerBuyQuote, ignore]`
 */
export function parseKlines(raw: unknown, endpoint = "klines"): Kline[] {
  if (!Array.isArray(raw)) fail(endpoint, "expected an array of klines");
  return raw.map((row, index) => {
    if (!Array.isArray(row) || row.length < 11) {
      fail(endpoint, `kline #${index} has ${Array.isArray(row) ? row.length : 0} fields`);
    }
    const at = (position: number, field: string): number =>
      num(row[position], endpoint, `kline[${index}].${field}`);
    return {
      openTime: at(0, "openTime"),
      open: at(1, "open"),
      high: at(2, "high"),
      low: at(3, "low"),
      close: at(4, "close"),
      volume: at(5, "volume"),
      closeTime: at(6, "closeTime"),
      quoteVolume: at(7, "quoteVolume"),
      trades: at(8, "trades"),
      takerBuyBase: at(9, "takerBuyBase"),
      takerBuyQuote: at(10, "takerBuyQuote"),
    };
  });
}

function parseTicker(value: unknown, endpoint: string, index: number | null): Ticker24h {
  const record = asRecord(value, endpoint);
  const label = index === null ? "ticker" : `ticker[${index}]`;
  return {
    symbol: str(record.symbol, endpoint, `${label}.symbol`),
    lastPrice: num(record.lastPrice, endpoint, `${label}.lastPrice`),
    priceChangePercent: num(record.priceChangePercent, endpoint, `${label}.priceChangePercent`),
    quoteVolume: num(record.quoteVolume, endpoint, `${label}.quoteVolume`),
    volume: num(record.volume, endpoint, `${label}.volume`),
    highPrice: num(record.highPrice, endpoint, `${label}.highPrice`),
    lowPrice: num(record.lowPrice, endpoint, `${label}.lowPrice`),
    openPrice: num(record.openPrice, endpoint, `${label}.openPrice`),
    count: num(record.count, endpoint, `${label}.count`),
  };
}

/** Parses `/api/v3/ticker/24hr` in both its single-object and array forms. */
export function parseTicker24h(raw: unknown, endpoint = "ticker24h"): Ticker24h[] {
  if (Array.isArray(raw)) return raw.map((item, index) => parseTicker(item, endpoint, index));
  return [parseTicker(raw, endpoint, null)];
}

/** Parses `/api/v3/ticker/bookTicker` in both its single-object and array forms. */
export function parseBookTicker(raw: unknown, endpoint = "bookTicker"): BookTicker[] {
  const rows = Array.isArray(raw) ? raw : [raw];
  return rows.map((value, index) => {
    const record = asRecord(value, endpoint);
    const label = `bookTicker[${index}]`;
    return {
      symbol: str(record.symbol, endpoint, `${label}.symbol`),
      bidPrice: num(record.bidPrice, endpoint, `${label}.bidPrice`),
      bidQty: num(record.bidQty, endpoint, `${label}.bidQty`),
      askPrice: num(record.askPrice, endpoint, `${label}.askPrice`),
      askQty: num(record.askQty, endpoint, `${label}.askQty`),
    };
  });
}

/** Mid-price helper shared by liquidity filtering and the risk gate. */
export function midPrice(book: BookTicker): number {
  return (book.bidPrice + book.askPrice) / 2;
}

/** Full relative spread of a book snapshot, in percent of the mid price. */
export function spreadPct(book: BookTicker): number {
  const mid = midPrice(book);
  if (!Number.isFinite(mid) || mid <= 0) return Number.POSITIVE_INFINITY;
  return ((book.askPrice - book.bidPrice) / mid) * 100;
}

/**
 * Parses `/api/v3/exchangeInfo`, keeping only symbols we can actually trade
 * on Spot: `status === TRADING` and quoted in USDT.
 */
export function parseExchangeInfo(
  raw: unknown,
  quoteAsset: string = QUOTE_ASSET,
  endpoint = "exchangeInfo",
): SymbolInfo[] {
  const record = asRecord(raw, endpoint);
  if (!Array.isArray(record.symbols)) fail(endpoint, 'missing "symbols" array');
  const symbols: SymbolInfo[] = [];
  for (const value of record.symbols) {
    const entry = asRecord(value, endpoint);
    if (entry.status !== "TRADING") continue;
    if (entry.quoteAsset !== quoteAsset) continue;
    if (typeof entry.symbol !== "string" || typeof entry.baseAsset !== "string") continue;
    symbols.push({
      symbol: entry.symbol,
      baseAsset: entry.baseAsset,
      quoteAsset: entry.quoteAsset as string,
      status: entry.status as string,
    });
  }
  return symbols;
}

/** Reads the deprecated-but-divergent `X-MBX-USED-WEIGHT-1M` style headers. */
export function parseUsedWeight(headers: Headers): number | null {
  for (const name of ["x-mbx-used-weight-1m", "x-mbx-used-weight"]) {
    const value = headers.get(name);
    if (value === null) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}
