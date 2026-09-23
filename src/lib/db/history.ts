/**
 * Reader for the `scans` table.
 *
 * Rows are read defensively: anything that no longer matches the expected
 * shape (hand-edited row, older schema, truncated JSON) is skipped instead of
 * failing the whole request, because a single bad row should not blank out the
 * signal history.
 */

import { MARKET_REGIMES, SCAN_STATUSES } from "@/shared/types";
import type { HistoryEntry, MarketRegime, ScanStatus } from "@/shared/types";

/** Raw column shape as SQLite returns it, before validation. */
interface ScanRow {
  id: unknown;
  created_at: unknown;
  symbol: unknown;
  price: unknown;
  score: unknown;
  status: unknown;
  market_regime: unknown;
  target_price: unknown;
  invalidation_price: unknown;
  price_1h: unknown;
  price_6h: unknown;
  price_24h: unknown;
  max_gain_24h: unknown;
  max_drawdown_24h: unknown;
  target3_hit: unknown;
  target5_hit: unknown;
  reasons_json: unknown;
  risks_json: unknown;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function asHitOrNull(value: unknown): boolean | null {
  return value === 0 ? false : value === 1 ? true : null;
}

function toHistoryEntry(row: ScanRow): HistoryEntry | null {
  const id = asNumberOrNull(row.id);
  const score = asNumberOrNull(row.score);
  if (id === null || score === null) return null;
  if (typeof row.created_at !== "string" || row.created_at.length === 0) return null;
  if (typeof row.status !== "string") return null;
  if (!(SCAN_STATUSES as readonly string[]).includes(row.status)) return null;
  if (typeof row.market_regime !== "string") return null;
  if (!(MARKET_REGIMES as readonly string[]).includes(row.market_regime)) return null;

  const entry = {
    id,
    createdAt: row.created_at,
    symbol: typeof row.symbol === "string" ? row.symbol : null,
    price: asNumberOrNull(row.price),
    score,
    status: row.status as ScanStatus,
    marketRegime: row.market_regime as MarketRegime,
    targetPrice: asNumberOrNull(row.target_price),
    invalidationPrice: asNumberOrNull(row.invalidation_price),
    reasons: asStringArray(row.reasons_json),
    risks: asStringArray(row.risks_json),
  };

  const outcome = {
    price1h: asNumberOrNull(row.price_1h),
    price6h: asNumberOrNull(row.price_6h),
    price24h: asNumberOrNull(row.price_24h),
    mfePct: asNumberOrNull(row.max_gain_24h),
    maePct: asNumberOrNull(row.max_drawdown_24h),
    target3Hit: asHitOrNull(row.target3_hit),
    target5Hit: asHitOrNull(row.target5_hit),
  };
  const hasOutcome = Object.values(outcome).some((value) => value !== null);

  return hasOutcome ? { ...entry, outcome } : entry;
}

/**
 * Read the most recent decisions, newest first.
 *
 * `limit` is expected to be pre-validated and clamped by the route.
 */
export async function queryHistory(db: D1Database, limit: number): Promise<HistoryEntry[]> {
  try {
    const result = await db
      .prepare(
        `SELECT s.id, s.created_at, s.symbol, s.price, s.score, s.status, s.market_regime,
                s.target_price, s.invalidation_price, s.reasons_json, s.risks_json,
                r.price_1h, r.price_6h, r.price_24h, r.max_gain_24h,
                r.max_drawdown_24h, r.target3_hit, r.target5_hit
           FROM scans AS s
      LEFT JOIN scan_results AS r ON r.scan_id = s.id
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT ?`,
      )
      .bind(limit)
      .all<ScanRow>();

    const rows = Array.isArray(result.results) ? result.results : [];
    const entries: HistoryEntry[] = [];
    for (const row of rows) {
      const entry = toHistoryEntry(row);
      if (entry !== null) entries.push(entry);
    }
    return entries;
  } catch (error) {
    console.warn("queryHistory: D1 read failed", error);
    return [];
  }
}
