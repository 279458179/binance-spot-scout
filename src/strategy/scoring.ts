import {
  ENTRY_SUB_WEIGHTS,
  PENALTIES,
  RISK_REWARD_SUB_WEIGHTS,
  RSI_BANDS,
  SCAN_CONFIG,
  SCORE_WEIGHTS,
  THRESHOLDS,
  TREND_SUB_WEIGHTS,
  VOLUME_RATIO_BANDS,
} from "@/config/strategy";
import type {
  IntervalMetrics,
  PatternDetection,
  ScoreBreakdown,
  SupportResistance,
  Ticker24h,
} from "@/shared/types";
import { liquidityPoints } from "@/strategy/liquidity";

/**
 * Everything the scorer needs, already reduced to primitives.
 *
 * `trend` is the 1h metrics, `primary` the 15m metrics. `lastCandleMovePct` is the
 * body move of the most recent 15m candle (used by the single-candle-pump penalty).
 */
export interface ScoreInput {
  trend: IntervalMetrics;
  primary: IntervalMetrics;
  pattern: PatternDetection;
  ticker24h: Ticker24h;
  quoteVolume24h: number;
  spreadPct: number;
  supportResistance: SupportResistance;
  /** Points from `assessMarketRegime()` — riskOn +5 / neutral 0 / riskOff -5. */
  marketRegimePoints: number;
  lastCandleMovePct: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Highest score reachable from the positive buckets, ignoring market + penalty. */
export const MAX_POSITIVE_SCORE =
  SCORE_WEIGHTS.trend +
  SCORE_WEIGHTS.momentum +
  SCORE_WEIGHTS.volume +
  SCORE_WEIGHTS.entry +
  SCORE_WEIGHTS.liquidity +
  SCORE_WEIGHTS.riskReward;

function volumeBandPoints(value: number): number {
  for (const band of VOLUME_RATIO_BANDS) {
    if (value >= band.min) {
      return band.points;
    }
  }
  return 0;
}

function rsiBandPoints(value: number): number {
  for (const band of RSI_BANDS) {
    if (value >= band.min && value < band.max) {
      return band.points;
    }
  }
  return 0;
}

function scoreTrend(trend: IntervalMetrics, primary: IntervalMetrics): number {
  let points = 0;

  const trendStacked = trend.ema9 > trend.ema21 && trend.ema21 > trend.ema55;
  const primaryStacked = primary.ema9 > primary.ema21 && primary.ema21 > primary.ema55;
  if (trendStacked) {
    points += TREND_SUB_WEIGHTS.stack * 0.6;
  }
  if (primaryStacked) {
    points += TREND_SUB_WEIGHTS.stack * 0.4;
  }

  if (trend.ema21Slope > 0) {
    points += TREND_SUB_WEIGHTS.slope * 0.625;
  }
  if (primary.ema21Slope > 0) {
    points += TREND_SUB_WEIGHTS.slope * 0.375;
  }

  if (trend.higherHigh && trend.higherLow) {
    points += TREND_SUB_WEIGHTS.structure * 0.6;
  }
  if (primary.higherHigh && primary.higherLow) {
    points += TREND_SUB_WEIGHTS.structure * 0.4;
  }

  return round2(clamp(points, 0, SCORE_WEIGHTS.trend));
}

function scoreMomentum(primary: IntervalMetrics): number {
  let points = rsiBandPoints(primary.rsi14);

  const extendedFromEma21 = Math.abs(primary.distanceFromEma21Atr) > 1.5;
  if (!extendedFromEma21) {
    if (primary.macdHistogram > 0) {
      points += 4;
    }
    if (primary.macdHistogram > 0 && primary.macdHistogram > primary.macdHistogramPrev) {
      points += 2;
    }
  }

  return round2(clamp(points, 0, SCORE_WEIGHTS.momentum));
}

function scoreVolume(primary: IntervalMetrics): number {
  let points = volumeBandPoints(primary.volumeRatio);

  const pushingUp = primary.close > primary.vwap;
  if (pushingUp && primary.volumeRatio >= 1.2) {
    points += 3;
  }
  if (pushingUp && primary.volumeRatio < 1.0) {
    points = Math.min(points, 3);
  }

  return round2(clamp(points, 0, SCORE_WEIGHTS.volume));
}

function scoreEntry(primary: IntervalMetrics, pattern: PatternDetection, blocked: boolean): number {
  const distanceAtr = Math.abs(primary.distanceFromEma21Atr);
  let distancePoints = 0;
  if (distanceAtr <= 0.8) {
    distancePoints = ENTRY_SUB_WEIGHTS.distance;
  } else if (distanceAtr <= 1.2) {
    distancePoints = ENTRY_SUB_WEIGHTS.distance * 0.75;
  } else if (distanceAtr <= 1.8) {
    distancePoints = ENTRY_SUB_WEIGHTS.distance * 0.5;
  } else if (distanceAtr <= SCAN_CONFIG.maxDistanceFromEma21Atr) {
    distancePoints = ENTRY_SUB_WEIGHTS.distance * 0.25;
  }

  let patternPoints = 0;
  if (pattern.matched) {
    if (pattern.kind === "A_EMA21_PULLBACK_RECLAIM") {
      patternPoints = ENTRY_SUB_WEIGHTS.pattern;
    } else if (pattern.kind === "B_BREAKOUT_HOLD") {
      patternPoints = ENTRY_SUB_WEIGHTS.pattern * (5 / 7);
    } else if (pattern.kind === "C_TREND_CONTINUATION") {
      patternPoints = ENTRY_SUB_WEIGHTS.pattern * (3 / 7);
    }
  }

  let points = distancePoints + patternPoints;
  if (blocked) {
    points = Math.min(points, SCORE_WEIGHTS.entry * 0.4);
  }
  return round2(clamp(points, 0, SCORE_WEIGHTS.entry));
}

function scoreLiquidity(quoteVolume24h: number, spreadPct: number): number {
  const base = liquidityPoints(quoteVolume24h);
  if (spreadPct > SCAN_CONFIG.maxSpreadPct) {
    return 0;
  }
  if (spreadPct > SCAN_CONFIG.preferredSpreadPct) {
    return round2(clamp(base * 0.7, 0, SCORE_WEIGHTS.liquidity));
  }
  return round2(clamp(base, 0, SCORE_WEIGHTS.liquidity));
}

function scoreRiskReward(
  supportResistance: SupportResistance,
  primary: IntervalMetrics,
): number {
  const { roomToResistance, invalidationDistance } = RISK_REWARD_SUB_WEIGHTS;
  let points = 0;

  if (!supportResistance.targetBlocked) {
    const room = supportResistance.distanceToResistancePct;
    if (room >= SCAN_CONFIG.targetPct) {
      points += roomToResistance;
    } else if (room > 0) {
      points += roomToResistance * (room / SCAN_CONFIG.targetPct);
    }
  }

  const atrPct = Math.max(primary.atrPct, 0.05);
  const supportAtr = supportResistance.distanceToSupportPct / atrPct;
  if (supportAtr >= 0.8 && supportAtr <= 2.5) {
    points += invalidationDistance;
  } else if ((supportAtr >= 0.4 && supportAtr < 0.8) || (supportAtr > 2.5 && supportAtr <= 4)) {
    points += invalidationDistance * 0.5;
  }

  return round2(clamp(points, 0, SCORE_WEIGHTS.riskReward));
}

function computePenalty(input: ScoreInput): number {
  const { primary, ticker24h, supportResistance } = input;
  let penalty = 0;

  if (primary.rsi14 >= THRESHOLDS.rsiExtreme) {
    penalty += PENALTIES.rsiExtreme;
  } else if (primary.rsi14 > SCAN_CONFIG.rsiOverbought) {
    penalty += PENALTIES.rsiOverbought;
  }

  const distanceAtr = Math.abs(primary.distanceFromEma21Atr);
  if (distanceAtr > THRESHOLDS.distanceEma21ExtremeAtr) {
    penalty += PENALTIES.distanceEma21Extreme;
  } else if (distanceAtr > THRESHOLDS.distanceEma21WideAtr) {
    penalty += PENALTIES.distanceEma21Wide;
  }

  if (input.lastCandleMovePct >= THRESHOLDS.singleCandlePumpPct) {
    penalty += PENALTIES.singleCandlePump;
  }

  if (ticker24h.priceChangePercent >= THRESHOLDS.rally24hExtendedPct) {
    penalty += PENALTIES.rally24hExtended;
  }

  if (primary.upperWickRatio >= THRESHOLDS.upperWickHeavyRatio && primary.close > primary.ema21) {
    penalty += PENALTIES.upperWickHeavy;
  }

  if (primary.atrPct >= THRESHOLDS.atrPctExtreme) {
    penalty += PENALTIES.atrVolatilityExtreme;
  }

  if (supportResistance.targetBlocked) {
    penalty += PENALTIES.distanceEma21Wide * 0.5;
  }

  return round2(penalty);
}

/**
 * Deterministic, side-effect-free scorer. Risk Gate still outranks this value:
 * a high score never overrides a failed gate.
 */
export function scoreCandidate(input: ScoreInput): ScoreBreakdown {
  const blocked = input.supportResistance.targetBlocked;

  const trend = scoreTrend(input.trend, input.primary);
  const momentum = scoreMomentum(input.primary);
  const volume = scoreVolume(input.primary);
  const entry = scoreEntry(input.primary, input.pattern, blocked);
  const liquidity = scoreLiquidity(input.quoteVolume24h, input.spreadPct);
  const riskReward = scoreRiskReward(input.supportResistance, input.primary);
  const market = round2(clamp(input.marketRegimePoints, -SCORE_WEIGHTS.market, SCORE_WEIGHTS.market));
  const penalty = computePenalty(input);

  const positive = trend + momentum + volume + entry + liquidity + riskReward;
  const total = round2(clamp(positive + market - penalty, 0, 100));

  return { trend, momentum, volume, entry, liquidity, riskReward, market, penalty, total };
}
