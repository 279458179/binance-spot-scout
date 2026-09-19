/**
 * Swing-based support / resistance detection.
 *
 * The scanner only ever aims for a +5% move, so what matters is not a fancy
 * level map but a single question: "is there a wall of sellers close enough
 * above the entry that the target is unreachable?"
 */

import { SCAN_CONFIG, THRESHOLDS } from "@/config/strategy";
import type { Kline, SupportResistance } from "@/shared/types";
import { atr } from "@/lib/indicators";

/** Bars on each side that must stay below a swing high for it to count. */
const SWING_LOOKBACK = 2;
/** How far back we look for levels; older pivots are stale. */
const MAX_PIVOT_AGE_BARS = 60;

interface Pivot {
  price: number;
  index: number;
  /** Bars between the pivot and the most recent candle. */
  age: number;
}

function findPivots(
  klines: readonly Kline[],
  kind: "high" | "low",
): Pivot[] {
  const pivots: Pivot[] = [];
  const lastIndex = klines.length - 1;
  for (let i = SWING_LOOKBACK; i < klines.length - SWING_LOOKBACK; i += 1) {
    const value = kind === "high" ? klines[i].high : klines[i].low;
    let isPivot = true;
    for (let j = i - SWING_LOOKBACK; j <= i + SWING_LOOKBACK; j += 1) {
      if (j === i) continue;
      const other = kind === "high" ? klines[j].high : klines[j].low;
      if (kind === "high" ? other >= value : other <= value) {
        isPivot = false;
        break;
      }
    }
    const age = lastIndex - i;
    if (isPivot && age <= MAX_PIVOT_AGE_BARS) {
      pivots.push({ price: value, index: i, age });
    }
  }
  return pivots;
}

function pickNearest(
  pivots: readonly Pivot[],
  price: number,
  side: "above" | "below",
): Pivot | null {
  let best: Pivot | null = null;
  for (const pivot of pivots) {
    const isRightSide = side === "above" ? pivot.price > price : pivot.price < price;
    if (!isRightSide) continue;
    if (best === null) {
      best = pivot;
      continue;
    }
    const closer = Math.abs(pivot.price - price) < Math.abs(best.price - price);
    const sameDistance = Math.abs(pivot.price - price) === Math.abs(best.price - price);
    if (closer || (sameDistance && pivot.age < best.age)) best = pivot;
  }
  return best;
}

/**
 * Nearest swing high above and swing low below the last close.
 *
 * Falls back to the 20-bar high/low and finally to an ATR-scaled estimate so
 * the caller always receives usable distances instead of nulls.
 */
export function detectSupportResistance(klines: readonly Kline[]): SupportResistance | null {
  if (klines.length < THRESHOLDS.minBars) return null;
  const last = klines[klines.length - 1];
  const price = last.close;
  if (!Number.isFinite(price) || price <= 0) return null;

  const highPivots = findPivots(klines, "high");
  const lowPivots = findPivots(klines, "low");
  const resistancePivot = pickNearest(highPivots, price, "above");
  const supportPivot = pickNearest(lowPivots, price, "below");

  let method = "SWING_PIVOT";
  let resistance = resistancePivot?.price ?? null;
  let support = supportPivot?.price ?? null;

  if (resistance === null) {
    // No pivot above: the 20-bar high is the only visible ceiling.
    const window = klines.slice(-20);
    const high20 = Math.max(...window.map((k) => k.high));
    if (high20 > price) {
      resistance = high20;
      method = "TWENTY_BAR_HIGH";
    }
  }
  if (support === null) {
    const window = klines.slice(-20);
    const low20 = Math.min(...window.map((k) => k.low));
    if (low20 < price) support = low20;
  }

  const atr14 = atr(
    klines.map((k) => k.high),
    klines.map((k) => k.low),
    klines.map((k) => k.close),
    14,
  );
  const atrFallback = atr14 === null || !Number.isFinite(atr14) ? price * 0.02 : atr14;
  if (resistance === null) {
    resistance = price + atrFallback * 3;
    method = "ATR_ESTIMATE";
  }
  if (support === null) {
    support = Math.max(price - atrFallback * 3, price * 0.5);
    method = method === "ATR_ESTIMATE" ? "ATR_ESTIMATE" : "ATR_SUPPORT_ESTIMATE";
  }

  const distanceToResistancePct = ((resistance - price) / price) * 100;
  const distanceToSupportPct = ((price - support) / price) * 100;

  return {
    support,
    resistance,
    distanceToResistancePct,
    distanceToSupportPct,
    targetBlocked: distanceToResistancePct < SCAN_CONFIG.targetPct,
    method,
  };
}
