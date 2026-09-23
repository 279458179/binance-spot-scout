import { describe, expect, it } from "vitest";
import { SCORE_WEIGHTS } from "@/config/strategy";
import { MAX_POSITIVE_SCORE, scoreCandidate } from "@/strategy/scoring";
import type { IntervalMetrics, PatternDetection } from "@/shared/types";
import {
  makeMetrics,
  makeNoPattern,
  makePattern,
  makeScoreInput,
  makeSupportResistance,
  makeTrendMetrics,
} from "../fixtures/metrics";

/** 15m/1h snapshot with no stack, no slope and no structure — the trend floor. */
function neutralPrimary(overrides: Partial<IntervalMetrics> = {}): IntervalMetrics {
  return makeMetrics({
    ema9: 100,
    ema21: 100,
    ema55: 100,
    ema21Slope: 0,
    higherHigh: false,
    higherLow: false,
    ...overrides,
  });
}

function neutralTrend(overrides: Partial<IntervalMetrics> = {}): IntervalMetrics {
  return makeTrendMetrics({
    ema9: 100,
    ema21: 100,
    ema55: 100,
    ema21Slope: 0,
    higherHigh: false,
    higherLow: false,
    ...overrides,
  });
}

function trendPoints(overrides: {
  trend?: Partial<IntervalMetrics>;
  primary?: Partial<IntervalMetrics>;
}): number {
  return scoreCandidate(
    makeScoreInput({
      trend: neutralTrend(overrides.trend ?? {}),
      primary: neutralPrimary(overrides.primary ?? {}),
    }),
  ).trend;
}

function momentumPoints(overrides: Partial<IntervalMetrics>): number {
  return scoreCandidate(makeScoreInput({ primary: makeMetrics(overrides) })).momentum;
}

function volumePoints(overrides: Partial<IntervalMetrics>): number {
  return scoreCandidate(makeScoreInput({ primary: makeMetrics(overrides) })).volume;
}

function entryPoints(
  primary: Partial<IntervalMetrics>,
  pattern: PatternDetection,
  blocked = false,
): number {
  return scoreCandidate(
    makeScoreInput({
      primary: makeMetrics(primary),
      pattern,
      supportResistance: makeSupportResistance({ targetBlocked: blocked }),
    }),
  ).entry;
}

function liquidityPoints(quoteVolume24h: number, spreadPct: number): number {
  return scoreCandidate(makeScoreInput({ quoteVolume24h, spreadPct })).liquidity;
}

/** Isolates the invalidation-distance half of the risk/reward bucket. */
function invalidationPoints(distanceToSupportPct: number, atrPct: number): number {
  return scoreCandidate(
    makeScoreInput({
      primary: makeMetrics({ atrPct }),
      supportResistance: makeSupportResistance({
        distanceToResistancePct: 0,
        distanceToSupportPct,
      }),
    }),
  ).riskReward;
}

function riskRewardFor(overrides: Partial<Parameters<typeof makeSupportResistance>[0]>): number {
  return scoreCandidate(makeScoreInput({ supportResistance: makeSupportResistance(overrides) }))
    .riskReward;
}

function penaltyPoints(overrides: {
  primary?: Partial<IntervalMetrics>;
  ticker24h?: { priceChangePercent?: number };
  lastCandleMovePct?: number;
  targetBlocked?: boolean;
}): number {
  return scoreCandidate(
    makeScoreInput({
      primary: makeMetrics(overrides.primary ?? {}),
      ticker24h: overrides.ticker24h ?? {},
      lastCandleMovePct: overrides.lastCandleMovePct ?? 0.5,
      supportResistance: makeSupportResistance({
        targetBlocked: overrides.targetBlocked ?? false,
      }),
    }),
  ).penalty;
}

describe("scoreCandidate — healthy baseline", () => {
  it("walks the textbook setup through every bucket to 93/100", () => {
    const score = scoreCandidate(makeScoreInput());

    expect(score).toEqual({
      trend: 25,
      momentum: 20,
      volume: 13,
      entry: 15,
      liquidity: 10,
      riskReward: 10,
      market: 0,
      penalty: 0,
      total: 93,
    });
  });

  it("keeps the positive weights summing to 100 and each bucket inside its cap", () => {
    expect(MAX_POSITIVE_SCORE).toBe(95);
    expect(
      SCORE_WEIGHTS.trend +
        SCORE_WEIGHTS.momentum +
        SCORE_WEIGHTS.volume +
        SCORE_WEIGHTS.entry +
        SCORE_WEIGHTS.liquidity +
        SCORE_WEIGHTS.riskReward,
    ).toBe(MAX_POSITIVE_SCORE);

    const score = scoreCandidate(makeScoreInput());
    expect(score.trend).toBeLessThanOrEqual(SCORE_WEIGHTS.trend);
    expect(score.momentum).toBeLessThanOrEqual(SCORE_WEIGHTS.momentum);
    expect(score.volume).toBeLessThanOrEqual(SCORE_WEIGHTS.volume);
    expect(score.entry).toBeLessThanOrEqual(SCORE_WEIGHTS.entry);
    expect(score.liquidity).toBeLessThanOrEqual(SCORE_WEIGHTS.liquidity);
    expect(score.riskReward).toBeLessThanOrEqual(SCORE_WEIGHTS.riskReward);
  });
});

describe("trend bucket (25 pts)", () => {
  it("scores the fully stacked, rising, higher-high/lower-low pair at 25", () => {
    expect(scoreCandidate(makeScoreInput()).trend).toBe(25);
  });

  it("scores a flat pair at 0", () => {
    expect(trendPoints({})).toBe(0);
  });

  it("weights the 1h stack 0.6 and the 15m stack 0.4", () => {
    expect(trendPoints({ trend: { ema9: 99, ema21: 98, ema55: 97 } })).toBe(7.2);
    expect(trendPoints({ primary: { ema9: 99, ema21: 98, ema55: 97 } })).toBe(4.8);
  });

  it("ignores a partially ordered stack", () => {
    expect(trendPoints({ trend: { ema9: 99, ema21: 98, ema55: 99 } })).toBe(0);
    expect(trendPoints({ primary: { ema9: 99, ema21: 99, ema55: 97 } })).toBe(0);
  });

  it("weights the 1h slope 0.625 and the 15m slope 0.375", () => {
    expect(trendPoints({ trend: { ema21Slope: 0.2 } })).toBe(5);
    expect(trendPoints({ primary: { ema21Slope: 0.2 } })).toBe(3);
  });

  it("gives no slope credit for flat or falling EMA21", () => {
    expect(trendPoints({ trend: { ema21Slope: 0 }, primary: { ema21Slope: 0 } })).toBe(0);
    expect(trendPoints({ trend: { ema21Slope: -0.1 }, primary: { ema21Slope: -0.1 } })).toBe(0);
  });

  it("weights structure 0.6 / 0.4 and requires both higher high and higher low", () => {
    expect(trendPoints({ trend: { higherHigh: true, higherLow: true } })).toBe(3);
    expect(trendPoints({ primary: { higherHigh: true, higherLow: true } })).toBe(2);
    expect(trendPoints({ trend: { higherHigh: true, higherLow: false } })).toBe(0);
    expect(trendPoints({ trend: { higherHigh: false, higherLow: true } })).toBe(0);
  });

  it("never exceeds the 25-point cap when every sub-signal fires", () => {
    expect(trendPoints({ trend: {}, primary: {} })).toBeLessThanOrEqual(SCORE_WEIGHTS.trend);
  });
});

describe("momentum bucket (20 pts)", () => {
  it("maps the RSI curve to its inclusive bands", () => {
    const cases: Array<[number, number]> = [
      [54.99, 0],
      [55, 14],
      [63.99, 14],
      [64, 10],
      [69.99, 10],
      [70, 4],
      [74.99, 4],
      [75, 0],
      [85, 0],
    ];

    for (const [rsi14, expected] of cases) {
      expect(momentumPoints({ rsi14, macdHistogram: 0, macdHistogramPrev: 0 })).toBe(expected);
    }
  });

  it("adds 4 for a positive histogram and 2 more when it expands", () => {
    expect(momentumPoints({ rsi14: 58, macdHistogram: 0, macdHistogramPrev: 0 })).toBe(14);
    expect(momentumPoints({ rsi14: 58, macdHistogram: 0.2, macdHistogramPrev: 0.2 })).toBe(18);
    expect(momentumPoints({ rsi14: 58, macdHistogram: 0.2, macdHistogramPrev: 0.1 })).toBe(20);
    expect(momentumPoints({ rsi14: 58, macdHistogram: -0.2, macdHistogramPrev: -0.3 })).toBe(14);
  });

  it("skips MACD entirely once price is more than 1.5 ATR from EMA21", () => {
    expect(momentumPoints({ rsi14: 58, distanceFromEma21Atr: 1.5 })).toBe(20);
    expect(momentumPoints({ rsi14: 58, distanceFromEma21Atr: 1.51 })).toBe(14);
    expect(momentumPoints({ rsi14: 58, distanceFromEma21Atr: -2 })).toBe(14);
  });

  it("stays inside the 20-point cap", () => {
    expect(momentumPoints({ rsi14: 58 })).toBeLessThanOrEqual(SCORE_WEIGHTS.momentum);
  });
});

describe("volume bucket (15 pts)", () => {
  it("maps the volume-ratio curve to its inclusive bands", () => {
    const cases: Array<[number, number]> = [
      [2, 15],
      [1.99, 13],
      [1.5, 13],
      [1.49, 9],
      [1.2, 9],
      [1.19, 3],
      [1, 3],
    ];

    for (const [volumeRatio, expected] of cases) {
      expect(volumePoints({ volumeRatio, close: 100, vwap: 99 })).toBe(expected);
    }
  });

  it("awards the 3-point push bonus only above VWAP with real volume", () => {
    expect(volumePoints({ volumeRatio: 2, close: 100, vwap: 99 })).toBe(15);
    expect(volumePoints({ volumeRatio: 2, close: 98, vwap: 99 })).toBe(12);
    expect(volumePoints({ volumeRatio: 1.4, close: 98, vwap: 99 })).toBe(6);
  });

  it("caps a quiet push above VWAP at 3 points", () => {
    expect(volumePoints({ volumeRatio: 0.99, close: 100, vwap: 99 })).toBe(0);
    expect(volumePoints({ volumeRatio: 1, close: 100, vwap: 99 })).toBe(3);
    expect(volumePoints({ volumeRatio: 0.5, close: 98, vwap: 99 })).toBe(0);
  });

  it("clamps the bucket at 15 points", () => {
    expect(volumePoints({ volumeRatio: 12, close: 100, vwap: 99 })).toBe(15);
  });
});

describe("entry bucket (15 pts)", () => {
  it("prices distance from EMA21 in ATR with a stepped curve", () => {
    const cases: Array<[number, number]> = [
      [0, 8],
      [0.8, 8],
      [0.81, 6],
      [1.2, 6],
      [1.21, 4],
      [1.8, 4],
      [1.81, 2],
      [2.5, 2],
      [2.51, 0],
      [-1, 6],
    ];

    for (const [distanceFromEma21Atr, expected] of cases) {
      expect(entryPoints({ distanceFromEma21Atr }, makeNoPattern())).toBe(expected);
    }
  });

  it("ranks pattern A above B above C and ignores unmatched detections", () => {
    expect(entryPoints({}, makePattern())).toBe(15);
    expect(entryPoints({}, makePattern({ kind: "B_BREAKOUT_HOLD" }))).toBe(13);
    expect(entryPoints({}, makePattern({ kind: "C_TREND_CONTINUATION" }))).toBe(11);
    expect(entryPoints({}, makeNoPattern())).toBe(8);
    expect(entryPoints({}, makePattern({ matched: false }))).toBe(8);
  });

  it("caps the bucket at 6 points when the target is blocked", () => {
    expect(entryPoints({ distanceFromEma21Atr: 0.5 }, makePattern(), true)).toBe(6);
    expect(entryPoints({ distanceFromEma21Atr: 2.4 }, makeNoPattern(), true)).toBe(2);
    expect(entryPoints({ distanceFromEma21Atr: 1.9 }, makePattern(), true)).toBe(6);
  });
});

describe("liquidity bucket (10 pts)", () => {
  it("maps 24h quote volume to its inclusive bands", () => {
    const cases: Array<[number, number]> = [
      [500_000_000, 10],
      [50_000_000, 10],
      [49_999_999, 8],
      [20_000_000, 8],
      [19_999_999, 6],
      [10_000_000, 6],
      [9_999_999, 4],
      [5_000_000, 4],
      [4_999_999, 0],
      [0, 0],
    ];

    for (const [quoteVolume24h, expected] of cases) {
      expect(liquidityPoints(quoteVolume24h, 0.2)).toBe(expected);
    }
  });

  it("punishes a wide spread with a 30% haircut and rejects beyond the ceiling", () => {
    expect(liquidityPoints(50_000_000, 0.3)).toBe(10);
    expect(liquidityPoints(50_000_000, 0.31)).toBe(7);
    expect(liquidityPoints(50_000_000, 0.6)).toBe(7);
    expect(liquidityPoints(50_000_000, 0.61)).toBe(0);
    expect(liquidityPoints(20_000_000, 0.5)).toBe(5.6);
  });
});

describe("risk/reward bucket (10 pts)", () => {
  it("pays 6 points once room to resistance reaches the 5% target", () => {
    expect(riskRewardFor({ distanceToResistancePct: 6 })).toBe(10);
    expect(riskRewardFor({ distanceToResistancePct: 5 })).toBe(10);
    expect(riskRewardFor({ distanceToResistancePct: 2.5 })).toBe(7);
    expect(riskRewardFor({ distanceToResistancePct: 1 })).toBe(5.2);
    expect(riskRewardFor({ distanceToResistancePct: 0 })).toBe(4);
    expect(riskRewardFor({ distanceToResistancePct: -1 })).toBe(4);
  });

  it("drops the room half entirely when the target is blocked", () => {
    expect(riskRewardFor({ targetBlocked: true })).toBe(4);
    expect(riskRewardFor({ targetBlocked: true, distanceToResistancePct: 0 })).toBe(4);
  });

  it("scales the invalidation half by distance-to-support in ATR", () => {
    const cases: Array<[number, number]> = [
      [0.39, 0],
      [0.4, 2],
      [0.79, 2],
      [0.8, 4],
      [2.5, 4],
      [2.51, 2],
      [4, 2],
      [4.01, 0],
    ];

    for (const [distanceToSupportPct, expected] of cases) {
      expect(invalidationPoints(distanceToSupportPct, 1)).toBe(expected);
    }
  });

  it("floors ATR at 0.05 so a dead-flat market cannot inflate the ratio", () => {
    expect(invalidationPoints(0.03, 0)).toBe(2);
    expect(invalidationPoints(0.019, 0)).toBe(0);
  });
});

describe("penalties", () => {
  it("charges 15 for an extreme RSI and 10 for merely overbought", () => {
    expect(penaltyPoints({ primary: { rsi14: 82 } })).toBe(15);
    expect(penaltyPoints({ primary: { rsi14: 81.9 } })).toBe(10);
    expect(penaltyPoints({ primary: { rsi14: 75.1 } })).toBe(10);
    expect(penaltyPoints({ primary: { rsi14: 75 } })).toBe(0);
  });

  it("charges 12 / 6 for being stretched from EMA21", () => {
    expect(penaltyPoints({ primary: { distanceFromEma21Atr: 3.01 } })).toBe(12);
    expect(penaltyPoints({ primary: { distanceFromEma21Atr: 3 } })).toBe(6);
    expect(penaltyPoints({ primary: { distanceFromEma21Atr: 2.01 } })).toBe(6);
    expect(penaltyPoints({ primary: { distanceFromEma21Atr: 2 } })).toBe(0);
  });

  it("charges for a single-candle pump and an extended 24h rally", () => {
    expect(penaltyPoints({ lastCandleMovePct: 7 })).toBe(8);
    expect(penaltyPoints({ lastCandleMovePct: 6.99 })).toBe(0);
    expect(penaltyPoints({ ticker24h: { priceChangePercent: 20 } })).toBe(5);
    expect(penaltyPoints({ ticker24h: { priceChangePercent: 19.99 } })).toBe(0);
  });

  it("charges for a heavy upper wick only above EMA21", () => {
    expect(penaltyPoints({ primary: { upperWickRatio: 0.45 } })).toBe(6);
    expect(penaltyPoints({ primary: { upperWickRatio: 0.44 } })).toBe(0);
    expect(penaltyPoints({ primary: { upperWickRatio: 0.45, close: 97 } })).toBe(0);
  });

  it("charges 5 when ATR reaches 6% of price and 3 when the target is blocked", () => {
    expect(penaltyPoints({ primary: { atrPct: 6 } })).toBe(5);
    expect(penaltyPoints({ primary: { atrPct: 5.99 } })).toBe(0);
    expect(penaltyPoints({ targetBlocked: true, primary: { atrPct: 5.99 } })).toBe(3);
  });

  it("stacks every penalty additively", () => {
    expect(
      penaltyPoints({
        primary: { rsi14: 82, distanceFromEma21Atr: 3.01, upperWickRatio: 0.5, atrPct: 6 },
        ticker24h: { priceChangePercent: 25 },
        lastCandleMovePct: 8,
        targetBlocked: true,
      }),
    ).toBe(15 + 12 + 8 + 5 + 6 + 5 + 3);
  });
});

describe("market regime and total", () => {
  it("adds or subtracts the regime points without touching the buckets", () => {
    const riskOn = scoreCandidate(makeScoreInput({ marketRegimePoints: 5 }));
    const riskOff = scoreCandidate(makeScoreInput({ marketRegimePoints: -5 }));

    expect(riskOn.market).toBe(5);
    expect(riskOn.total).toBe(98);
    expect(riskOn.trend).toBe(25);
    expect(riskOff.market).toBe(-5);
    expect(riskOff.total).toBe(88);
  });

  it("clamps the regime contribution to +/-5", () => {
    expect(scoreCandidate(makeScoreInput({ marketRegimePoints: 12 })).market).toBe(5);
    expect(scoreCandidate(makeScoreInput({ marketRegimePoints: -12 })).market).toBe(-5);
    expect(scoreCandidate(makeScoreInput({ marketRegimePoints: 12 })).total).toBe(98);
  });

  it("rounds the total to two decimals", () => {
    const score = scoreCandidate(
      makeScoreInput({ supportResistance: makeSupportResistance({ distanceToResistancePct: 1 }) }),
    );

    expect(score.riskReward).toBe(5.2);
    expect(score.total).toBe(88.2);
  });

  it("never lets a penalty push the total below 0", () => {
    const score = scoreCandidate(
      makeScoreInput({
        primary: makeMetrics({
          rsi14: 88,
          distanceFromEma21Atr: -3.5,
          upperWickRatio: 0.6,
          atrPct: 9,
          volumeRatio: 0.2,
          close: 96,
          vwap: 99,
        }),
        pattern: makeNoPattern(),
        marketRegimePoints: -5,
        lastCandleMovePct: 9,
        ticker24h: { priceChangePercent: 40 },
        supportResistance: makeSupportResistance({ targetBlocked: true }),
      }),
    );

    expect(score.penalty).toBeGreaterThan(40);
    expect(score.total).toBe(0);
  });

  it("reaches a perfect 100 when every bucket is healthy", () => {
    const score = scoreCandidate(
      makeScoreInput({
        primary: makeMetrics({ volumeRatio: 3, rsi14: 58 }),
        marketRegimePoints: 5,
      }),
    );

    expect(score.momentum).toBe(20);
    expect(score.total).toBe(100);
  });

  it("stays in the 0-100 range for a spread of adversarial inputs", () => {
    const cases: Array<Parameters<typeof makeScoreInput>[0]> = [
      {},
      { marketRegimePoints: 5 },
      { marketRegimePoints: -5 },
      { quoteVolume24h: 0, spreadPct: 5 },
      { pattern: makeNoPattern(), lastCandleMovePct: 99 },
      { primary: makeMetrics({ rsi14: 100, atrPct: 40, volumeRatio: 0 }) },
      { supportResistance: makeSupportResistance({ targetBlocked: true, distanceToResistancePct: 0 }) },
    ];

    for (const overrides of cases) {
      const score = scoreCandidate(makeScoreInput(overrides));
      expect(score.total).toBeGreaterThanOrEqual(0);
      expect(score.total).toBeLessThanOrEqual(100);
    }
  });
});
