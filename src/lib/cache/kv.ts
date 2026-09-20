/**
 * KV-backed cache for market data and scan results.
 *
 * Reads are deliberately forgiving: a missing key, a transport failure, or a
 * value whose shape no longer matches what we expect is reported as a miss
 * (`null`) rather than thrown, so a stale or corrupt entry can never take the
 * API down. Writes are best-effort for the same reason — the cache is an
 * optimisation, never a source of truth.
 */

import { MARKET_REGIMES } from "@/shared/types";
import type { MarketRegime, ScanPayload, SymbolInfo } from "@/shared/types";

/** Keys are namespaced by concern so `wrangler kv key list` stays readable. */
export const CACHE_KEYS = {
  latestScan: "scan:latest",
  exchangeInfo: "market:exchange-info",
  btcRegime: "market:btc-regime",
} as const;

/** Time-to-live per key, in seconds. */
export const CACHE_TTL_SECONDS = {
  /** Cron refreshes every two minutes; half an hour keeps a stale read explainable. */
  latestScan: 1800,
  /** Exchange filters change on Binance's schedule, not ours. */
  exchangeInfo: 43200,
  /** Drives the market-regime banner, so it is refreshed far more often. */
  btcRegime: 180,
} as const;

/**
 * Cached BTC context — the same `MarketRegimeAssessment` the scanner would
 * compute, plus the drop figure it was derived from so the UI can explain it.
 */
export interface BtcRegimeSnapshot {
  regime: MarketRegime;
  points: number;
  /** Sign-flipped 1h change, so a drop reads as a positive number. */
  btcDropPct1h: number | null;
  reasons: string[];
  updatedAt: string;
}

/** Reads the newest scan payload, or `null` when nothing usable is cached. */
export async function readLatestScan(kv: KVNamespace): Promise<ScanPayload | null> {
  return readJson(kv, CACHE_KEYS.latestScan, isScanPayload);
}

/** Stores the newest scan payload so the UI can open instantly. */
export async function writeLatestScan(kv: KVNamespace, payload: ScanPayload): Promise<boolean> {
  return writeJson(kv, CACHE_KEYS.latestScan, payload, CACHE_TTL_SECONDS.latestScan);
}

/** Reads the cached exchange symbol list, or `null` when absent or unusable. */
export async function readExchangeInfo(kv: KVNamespace): Promise<SymbolInfo[] | null> {
  return readJson(kv, CACHE_KEYS.exchangeInfo, isSymbolInfoList);
}

/** Caches the exchange symbol list — shared by the scanner and the detail route. */
export async function writeExchangeInfo(kv: KVNamespace, symbols: SymbolInfo[]): Promise<boolean> {
  return writeJson(kv, CACHE_KEYS.exchangeInfo, symbols, CACHE_TTL_SECONDS.exchangeInfo);
}

/** Reads the cached BTC regime snapshot, or `null` when absent or unusable. */
export async function readBtcRegime(kv: KVNamespace): Promise<BtcRegimeSnapshot | null> {
  return readJson(kv, CACHE_KEYS.btcRegime, isBtcRegimeSnapshot);
}

/** Caches the BTC regime snapshot under a short TTL. */
export async function writeBtcRegime(
  kv: KVNamespace,
  snapshot: BtcRegimeSnapshot,
): Promise<boolean> {
  return writeJson(kv, CACHE_KEYS.btcRegime, snapshot, CACHE_TTL_SECONDS.btcRegime);
}

/** Parses and shape-checks one cached value, downgrading every failure to a miss. */
async function readJson<TValue>(
  kv: KVNamespace,
  key: string,
  isValid: (value: unknown) => value is TValue,
): Promise<TValue | null> {
  try {
    const raw = await kv.get(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Serialises and stores one value, reporting whether the write succeeded. */
async function writeJson(
  kv: KVNamespace,
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<boolean> {
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Shallow-but-real validation: enough to prove the cached document is the
 * shape the routes read, without duplicating the full type as a runtime schema.
 */
function isScanPayload(value: unknown): value is ScanPayload {
  if (!isRecord(value)) return false;
  if (!isRecord(value.result) || !isRecord(value.diagnostics)) return false;
  return typeof value.result.status === "string" && typeof value.diagnostics.universeCount === "number";
}

function isSymbolInfoList(value: unknown): value is SymbolInfo[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => isRecord(entry) && typeof entry.symbol === "string")
  );
}

function isBtcRegimeSnapshot(value: unknown): value is BtcRegimeSnapshot {
  if (!isRecord(value)) return false;
  if (typeof value.regime !== "string") return false;
  if (!(MARKET_REGIMES as readonly string[]).includes(value.regime)) return false;
  return typeof value.points === "number" && Array.isArray(value.reasons);
}
