import type { Kline } from "@/shared/types";

/**
 * Keeps only closed candles. Used identically by live scans, symbol reads,
 * regime checks and backtests so a partial candle can never change a decision.
 */
export function filterClosedKlines(klines: readonly Kline[], now: number): Kline[] {
  return klines.filter((kline) => Number.isFinite(kline.closeTime) && kline.closeTime <= now);
}
