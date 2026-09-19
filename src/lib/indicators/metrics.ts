/**
 * Builds an `IntervalMetrics` snapshot for one interval from raw klines.
 *
 * Kept separate from `index.ts` so that the primitive indicator functions stay
 * free of shared-type dependencies and can be tested in isolation.
 */

import type { Interval, IntervalMetrics, Kline } from "@/shared/types";
import { THRESHOLDS } from "@/config/strategy";
import {
  atr,
  closes,
  ema,
  emaSeries,
  highs,
  highest,
  lows,
  lowest,
  macd,
  normalisedSlope,
  rsi,
  sma,
  volumes,
  vwap,
  wickRatios,
} from "./index";

/** Same shape as `IntervalMetrics` but with nullable fields, pre-validation. */
export type PartialIntervalMetrics = {
  [K in keyof IntervalMetrics]: IntervalMetrics[K] | null;
};

/**
 * Returns `null` when the kline history is too short to compute a complete
 * snapshot — callers treat that as "this interval has no opinion" and the
 * scanner drops the symbol rather than scoring partial data.
 */
export function buildIntervalMetrics(
  interval: Interval,
  klines: Kline[],
): IntervalMetrics | null {
  if (klines.length < THRESHOLDS.minBars) return null;

  const closeSeries = closes(klines);
  const volumeSeries = volumes(klines);
  const last = klines[klines.length - 1];

  const ema9 = ema(closeSeries, 9);
  const ema21 = ema(closeSeries, 21);
  const ema55 = ema(closeSeries, 55);
  const rsi14 = rsi(closeSeries, 14);
  const macdResult = macd(closeSeries);
  const atr14 = atr(highs(klines), lows(klines), closeSeries, 14);
  const volumeSma20 = sma(volumeSeries, 20);
  const vwapValue = vwap(klines, 20);
  const high20 = highest(highs(klines), 20);
  const low20 = lowest(lows(klines), 20);

  if (
    ema9 === null ||
    ema21 === null ||
    ema55 === null ||
    rsi14 === null ||
    macdResult.macdLine === null ||
    macdResult.signal === null ||
    macdResult.histogram === null ||
    atr14 === null ||
    volumeSma20 === null ||
    high20 === null ||
    low20 === null
  ) {
    return null;
  }

  const ema21Series = emaSeries(closeSeries, 21);
  const ema55Series = emaSeries(closeSeries, 55);
  const ema21Slope = normalisedSlope(ema21Series, 3);
  const ema55Slope = normalisedSlope(ema55Series, 3);
  if (ema21Slope === null || ema55Slope === null) return null;

  const wick = wickRatios(last);
  const previousHistogram = macd(closeSeries.slice(0, -1)).histogram;

  return {
    interval,
    close: last.close,
    ema9,
    ema21,
    ema55,
    ema21Slope,
    ema55Slope,
    rsi14,
    macdLine: macdResult.macdLine,
    macdSignal: macdResult.signal,
    macdHistogram: macdResult.histogram,
    macdHistogramPrev: previousHistogram ?? macdResult.histogram,
    atr14,
    atrPct: (atr14 / last.close) * 100,
    volumeSma20,
    volumeRatio: volumeSma20 > 0 ? last.volume / volumeSma20 : 0,
    vwap: vwapValue ?? last.close,
    high20,
    low20,
    upperWickRatio: wick.upper,
    lowerWickRatio: wick.lower,
    distanceFromEma21Atr: atr14 > 0 ? (last.close - ema21) / atr14 : 0,
    higherHigh: detectHigherHigh(highs(klines), 12),
    higherLow: detectHigherLow(lows(klines), 12),
  };
}

/** Compares the most recent swing high against the one before it. */
export function detectHigherHigh(highsList: number[], lookback: number): boolean {
  const split = Math.floor(lookback / 2);
  if (highsList.length < lookback) return false;
  const recent = Math.max(...highsList.slice(-split));
  const prior = Math.max(...highsList.slice(-lookback, -split));
  return recent > prior;
}

/** Compares the most recent swing low against the one before it. */
export function detectHigherLow(lowsList: number[], lookback: number): boolean {
  const split = Math.floor(lookback / 2);
  if (lowsList.length < lookback) return false;
  const recent = Math.min(...lowsList.slice(-split));
  const prior = Math.min(...lowsList.slice(-lookback, -split));
  return recent > prior;
}

/** Median absolute percentage change between consecutive closes, in percent. */
export function medianCandleMovePct(klines: Kline[]): number {
  const moves: number[] = [];
  for (let i = 1; i < klines.length; i += 1) {
    const prevClose = klines[i - 1].close;
    if (prevClose <= 0) continue;
    moves.push(Math.abs((klines[i].close - prevClose) / prevClose) * 100);
  }
  if (moves.length === 0) return 0;
  moves.sort((a, b) => a - b);
  const mid = Math.floor(moves.length / 2);
  return moves.length % 2 === 0 ? (moves[mid - 1] + moves[mid]) / 2 : moves[mid];
}

