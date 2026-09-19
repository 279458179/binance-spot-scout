/**
 * Candlestick-structure recognition.
 *
 * Three named setups are supported, in priority order. They are intentionally
 * narrow: the product promise is "one pick or no pick", so being permissive
 * here would silently turn the scanner into a momentum chaser.
 */

import { THRESHOLDS } from "@/config/strategy";
import type { IntervalMetrics, PatternDetection, PatternKind } from "@/shared/types";

/** Distance from EMA21 (in ATR) that still counts as "at" the average. */
const PULLBACK_TOLERANCE_ATR = 0.7;
/** Volume ratio required before a pullback reclaim is considered confirmed. */
const RECLAIM_VOLUME_RATIO = 1.1;
/** Distance from EMA21 (in ATR) beyond which pattern C stops counting. */
const CONTINUATION_MAX_DISTANCE_ATR = 1.5;

function detection(kind: PatternKind, label: string, matched: boolean): PatternDetection {
  return { kind, label, matched };
}

/**
 * Pattern A - EMA21 pullback reclaim on the primary interval, inside a clean
 * higher-timeframe uptrend. Highest priority because it buys strength on a dip
 * instead of paying up for an extended candle.
 */
function matchPullbackReclaim(
  trend: IntervalMetrics,
  primary: IntervalMetrics,
): PatternDetection {
  const label = "15m 回踩 EMA21 后重新站稳，1h 多头结构完整";
  const stacked = trend.ema9 > trend.ema21 && trend.ema21 > trend.ema55;
  const touched = Math.abs(primary.distanceFromEma21Atr) <= PULLBACK_TOLERANCE_ATR;
  const reclaimed = primary.close > primary.ema21 && primary.ema21Slope > 0;
  const volumeConfirmed = primary.volumeRatio >= RECLAIM_VOLUME_RATIO;
  return detection("A_EMA21_PULLBACK_RECLAIM", label, stacked && touched && reclaimed && volumeConfirmed);
}

/**
 * Pattern B - a 20-bar range break that is confirmed by volume but not so far
 * extended that the entry is a one-candle spike.
 */
function matchBreakoutHold(primary: IntervalMetrics): PatternDetection {
  const label = "价格放量突破 20 周期高点并站稳";
  const aboveHigh = primary.close > primary.high20;
  const extensionPct =
    primary.high20 > 0 ? ((primary.close - primary.high20) / primary.high20) * 100 : Number.POSITIVE_INFINITY;
  const notChasing = extensionPct <= THRESHOLDS.maxBreakoutExtensionPct;
  const volumeConfirmed = primary.volumeRatio >= THRESHOLDS.breakoutVolumeRatio;
  return detection("B_BREAKOUT_HOLD", label, aboveHigh && notChasing && volumeConfirmed);
}

/**
 * Pattern C - an orderly continuation: rising swing structure with the price
 * still close enough to the mean to offer a sane risk/reward.
 */
function matchTrendContinuation(primary: IntervalMetrics): PatternDetection {
  const label = "价格连续抬高低点，EMA21 保持上行";
  const structure = primary.higherHigh && primary.higherLow;
  const rising = primary.ema21Slope > 0;
  const nearMean = Math.abs(primary.distanceFromEma21Atr) <= CONTINUATION_MAX_DISTANCE_ATR;
  return detection("C_TREND_CONTINUATION", label, structure && rising && nearMean);
}

/**
 * Evaluate every pattern and return them in priority order.
 *
 * The caller reads `matched` rather than assuming index 0 is the winner, so
 * the full list is always returned for explainability.
 */
export function detectPatterns(
  trendMetrics: IntervalMetrics | null,
  primaryMetrics: IntervalMetrics | null,
): PatternDetection[] {
  if (primaryMetrics === null) {
    return [detection("NONE", "K 线数据不足，无法识别形态", false)];
  }

  const patterns: PatternDetection[] = [];
  if (trendMetrics !== null) {
    patterns.push(matchPullbackReclaim(trendMetrics, primaryMetrics));
  } else {
    patterns.push(
      detection("A_EMA21_PULLBACK_RECLAIM", "1h 趋势数据不足，无法确认回踩形态", false),
    );
  }
  patterns.push(matchBreakoutHold(primaryMetrics));
  patterns.push(matchTrendContinuation(primaryMetrics));

  if (!patterns.some((pattern) => pattern.matched)) {
    patterns.push(detection("NONE", "未识别到 A / B / C 形态", false));
  }
  return patterns;
}

/** The highest-priority matched pattern, or the `NONE` marker. */
export function bestPattern(patterns: readonly PatternDetection[]): PatternDetection {
  const matched = patterns.find((pattern) => pattern.matched);
  if (matched) return matched;
  const none = patterns.find((pattern) => pattern.kind === "NONE");
  return none ?? detection("NONE", "未识别到 A / B / C 形态", false);
}
