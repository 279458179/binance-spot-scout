import type {
  Interval,
  IntervalMetrics,
  PatternDetection,
  PatternKind,
  SupportResistance,
  Ticker24h,
} from "@/shared/types";
import { makeTicker } from "./market";
import type { ScoreInput } from "@/strategy/scoring";

/**
 * Healthy bullish 15m snapshot. Every value is deliberately "textbook good":
 * stacked EMAs, positive slopes, RSI in the sweet spot, expanding MACD
 * histogram, above-VWAP volume and a tight distance from EMA21.
 */
export function makeMetrics(overrides: Partial<IntervalMetrics> = {}): IntervalMetrics {
  return {
    interval: "15m" as Interval,
    close: 100,
    ema9: 99,
    ema21: 98,
    ema55: 97,
    ema21Slope: 0.5,
    ema55Slope: 0.3,
    rsi14: 58,
    macdLine: 0.5,
    macdSignal: 0.3,
    macdHistogram: 0.2,
    macdHistogramPrev: 0.1,
    atr14: 1,
    atrPct: 1,
    volumeSma20: 1_000,
    volumeRatio: 1.6,
    vwap: 99,
    high20: 105,
    low20: 90,
    upperWickRatio: 0.1,
    lowerWickRatio: 0.1,
    distanceFromEma21Atr: 0.5,
    higherHigh: true,
    higherLow: true,
    ...overrides,
  };
}

/** Metrics for the 1h timeframe; identical to 15m apart from the interval tag. */
export function makeTrendMetrics(overrides: Partial<IntervalMetrics> = {}): IntervalMetrics {
  return makeMetrics({ interval: "1h", ...overrides });
}

/** Pattern A is the preferred setup, so it is the default. */
export function makePattern(overrides: Partial<PatternDetection> = {}): PatternDetection {
  return {
    kind: "A_EMA21_PULLBACK_RECLAIM" as PatternKind,
    label: "回踩 EMA21 后收复",
    matched: true,
    ...overrides,
  };
}

/** A pattern that is detected for its kind but does not count as an entry. */
export function makeNoPattern(): PatternDetection {
  return { kind: "NONE", label: "无明确形态", matched: false };
}

/**
 * Resistance sits 6% above price (above the 5% target) and support 2% below,
 * which lands the invalidation distance comfortably inside the ATR band.
 */
export function makeSupportResistance(
  overrides: Partial<SupportResistance> = {},
): SupportResistance {
  return {
    support: 98,
    resistance: 106,
    distanceToResistancePct: 6,
    distanceToSupportPct: 2,
    targetBlocked: false,
    method: "swing_high_low",
    ...overrides,
  };
}

export interface ScoreInputOverrides extends Partial<Omit<ScoreInput, "ticker24h">> {
  ticker24h?: Partial<Ticker24h>;
}

/** Fully-formed scorer input for the healthy scenario (~87/100 before market). */
export function makeScoreInput(overrides: ScoreInputOverrides = {}): ScoreInput {
  const { ticker24h, ...rest } = overrides;
  return {
    trend: makeTrendMetrics(),
    primary: makeMetrics(),
    pattern: makePattern(),
    ticker24h: makeTicker(ticker24h),
    quoteVolume24h: 50_000_000,
    spreadPct: 0.2,
    supportResistance: makeSupportResistance(),
    marketRegimePoints: 0,
    lastCandleMovePct: 0.5,
    ...rest,
  };
}
