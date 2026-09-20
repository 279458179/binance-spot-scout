/**
 * Append-only writer for the `scans` table.
 *
 * Every scan that produces a decision is recorded — including `NO_TRADE`
 * ones — so the no-trade ratio stays measurable over time. The write is
 * best-effort: a D1 failure must never break the API response the user is
 * waiting on, so failures are reported as `null` rather than thrown.
 */

import type { ScanPayload, ScanResult, TradePlan } from "@/shared/types";

/** Snapshot of the numbers behind a decision, kept for later analysis. */
interface ScanFeatures {
  baseAsset: string | null;
  targetPct: number;
  strategyVersion: string;
  metrics: ScanResult["metrics"];
  plan: TradePlan | null;
}

function buildFeatures(result: ScanResult): ScanFeatures {
  return {
    baseAsset: result.baseAsset,
    targetPct: result.targetPct,
    strategyVersion: result.strategyVersion,
    metrics: result.metrics,
    plan: result.plan,
  };
}

/**
 * Persist one scan decision.
 *
 * Returns the new row id, or `null` when D1 rejected the write. Callers treat
 * a `null` as "history entry missing" and carry on.
 */
export async function insertScan(db: D1Database, payload: ScanPayload): Promise<number | null> {
  const { result } = payload;

  try {
    const write = await db
      .prepare(
        `INSERT INTO scans (
           created_at, symbol, price, score, status, market_regime,
           target_price, invalidation_price, features_json, reasons_json, risks_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        result.generatedAt,
        result.symbol,
        result.price,
        result.score,
        result.status,
        result.marketRegime,
        result.plan?.target5Pct ?? null,
        result.plan?.invalidation ?? null,
        JSON.stringify(buildFeatures(result)),
        JSON.stringify(result.reasons),
        JSON.stringify(result.risks),
      )
      .run();

    const meta = write.meta as { last_row_id?: number } | undefined;
    const id = meta?.last_row_id;
    if (typeof id !== "number" || !Number.isFinite(id) || id <= 0) {
      console.warn("insertScan: D1 did not return a row id");
      return null;
    }
    return id;
  } catch (error) {
    console.warn("insertScan: D1 write failed", error);
    return null;
  }
}
