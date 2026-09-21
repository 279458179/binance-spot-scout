import { describe, expect, it } from "vitest";
import { bestPattern, detectPatterns } from "@/strategy/patterns";
import type { IntervalMetrics } from "@/shared/types";
import { makeMetrics, makeTrendMetrics } from "../fixtures/metrics";

/** Pattern A only: keep price inside the 20 bar high so B stays out of the way. */
function pullbackPrimary(overrides: Partial<IntervalMetrics> = {}): IntervalMetrics {
  return makeMetrics({ high20: 105, close: 100, ...overrides });
}

/** Pattern B only: break the range but keep EMA21 distance inside the C band. */
function breakoutPrimary(overrides: Partial<IntervalMetrics> = {}): IntervalMetrics {
  return makeMetrics({ close: 106, high20: 105, distanceFromEma21Atr: 0.5, ...overrides });
}

/** Pattern C only: flat structure support, no breakout, no reclaim volume. */
function continuationPrimary(overrides: Partial<IntervalMetrics> = {}): IntervalMetrics {
  return makeMetrics({
    close: 99,
    high20: 105,
    volumeRatio: 0.9,
    higherHigh: true,
    higherLow: true,
    ema21Slope: 0.2,
    distanceFromEma21Atr: 1.2,
    ...overrides,
  });
}

describe("detectPatterns", () => {
  it("returns a single NONE marker when the primary series is missing", () => {
    const patterns = detectPatterns(makeTrendMetrics(), null);

    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toEqual({
      kind: "NONE",
      label: "K 线数据不足，无法识别形态",
      matched: false,
    });
  });

  it("returns the full priority list for the healthy default snapshot", () => {
    const patterns = detectPatterns(makeTrendMetrics(), makeMetrics());

    expect(patterns.map((pattern) => pattern.kind)).toEqual([
      "A_EMA21_PULLBACK_RECLAIM",
      "B_BREAKOUT_HOLD",
      "C_TREND_CONTINUATION",
    ]);
    expect(patterns[0]?.matched).toBe(true);
  });

  it("marks pattern A as unmatched with a placeholder when the 1h trend is missing", () => {
    const patterns = detectPatterns(null, continuationPrimary());

    expect(patterns[0]).toEqual({
      kind: "A_EMA21_PULLBACK_RECLAIM",
      label: "1h 趋势数据不足，无法确认回踩形态",
      matched: false,
    });
    expect(patterns.some((pattern) => pattern.matched)).toBe(true);
  });

  describe("pattern A", () => {
    it("matches the textbook pullback reclaim", () => {
      const [patternA] = detectPatterns(makeTrendMetrics(), pullbackPrimary());

      expect(patternA).toEqual({
        kind: "A_EMA21_PULLBACK_RECLAIM",
        label: "15m 回踩 EMA21 后重新站稳，1h 多头结构完整",
        matched: true,
      });
    });

    it("rejects A when the 1h EMAs are not stacked", () => {
      const patterns = detectPatterns(makeTrendMetrics({ ema21: 99, ema9: 99 }), pullbackPrimary());

      expect(patterns[0]?.matched).toBe(false);
    });

    it("rejects A when EMA21 sits below EMA55", () => {
      const patterns = detectPatterns(
        makeTrendMetrics({ ema21: 96, ema55: 96.5, ema9: 99 }),
        pullbackPrimary(),
      );

      expect(patterns[0]?.matched).toBe(false);
    });

    it("accepts the 0.7 ATR tolerance boundary", () => {
      const patterns = detectPatterns(makeTrendMetrics(), pullbackPrimary({ distanceFromEma21Atr: -0.7 }));

      expect(patterns[0]?.matched).toBe(true);
    });

    it("rejects A once the price drifts past 0.7 ATR", () => {
      const patterns = detectPatterns(makeTrendMetrics(), pullbackPrimary({ distanceFromEma21Atr: 0.71 }));

      expect(patterns[0]?.matched).toBe(false);
    });

    it("rejects A when the candle closed below EMA21", () => {
      const patterns = detectPatterns(makeTrendMetrics(), pullbackPrimary({ close: 97, ema21: 98 }));

      expect(patterns[0]?.matched).toBe(false);
    });

    it("rejects A when EMA21 is flat", () => {
      const patterns = detectPatterns(makeTrendMetrics(), pullbackPrimary({ ema21Slope: 0 }));

      expect(patterns[0]?.matched).toBe(false);
    });

    it("rejects A below the 1.1 volume confirmation ratio", () => {
      const patterns = detectPatterns(makeTrendMetrics(), pullbackPrimary({ volumeRatio: 1.09 }));

      expect(patterns[0]?.matched).toBe(false);
    });

    it("accepts A at exactly the 1.1 volume ratio", () => {
      const patterns = detectPatterns(makeTrendMetrics(), pullbackPrimary({ volumeRatio: 1.1 }));

      expect(patterns[0]?.matched).toBe(true);
    });
  });

  describe("pattern B", () => {
    it("matches a volume confirmed break of the 20 bar high", () => {
      const patterns = detectPatterns(makeTrendMetrics(), breakoutPrimary({ volumeRatio: 1.5 }));
      const patternB = patterns.find((pattern) => pattern.kind === "B_BREAKOUT_HOLD");

      expect(patternB).toEqual({
        kind: "B_BREAKOUT_HOLD",
        label: "价格放量突破 20 周期高点并站稳",
        matched: true,
      });
    });

    it("rejects B when price stays under the 20 bar high", () => {
      const patterns = detectPatterns(makeTrendMetrics(), breakoutPrimary({ close: 104, volumeRatio: 1.5 }));
      const patternB = patterns.find((pattern) => pattern.kind === "B_BREAKOUT_HOLD");

      expect(patternB?.matched).toBe(false);
    });

    it("rejects B when the candle sits exactly on the high", () => {
      const patterns = detectPatterns(makeTrendMetrics(), breakoutPrimary({ close: 105, volumeRatio: 1.5 }));
      const patternB = patterns.find((pattern) => pattern.kind === "B_BREAKOUT_HOLD");

      expect(patternB?.matched).toBe(false);
    });

    it("rejects B when volume is just under 1.5x", () => {
      const patterns = detectPatterns(makeTrendMetrics(), breakoutPrimary({ volumeRatio: 1.49 }));
      const patternB = patterns.find((pattern) => pattern.kind === "B_BREAKOUT_HOLD");

      expect(patternB?.matched).toBe(false);
    });

    it("rejects B when the break overshoots 1.5 percent", () => {
      const patterns = detectPatterns(
        makeTrendMetrics(),
        breakoutPrimary({ high20: 100, close: 101.6, volumeRatio: 2, distanceFromEma21Atr: 1.5 }),
      );
      const patternB = patterns.find((pattern) => pattern.kind === "B_BREAKOUT_HOLD");

      expect(patternB?.matched).toBe(false);
    });

    it("accepts B at exactly the 1.5 percent extension", () => {
      const patterns = detectPatterns(
        makeTrendMetrics(),
        breakoutPrimary({ high20: 100, close: 101.5, volumeRatio: 2, distanceFromEma21Atr: 1.5 }),
      );
      const patternB = patterns.find((pattern) => pattern.kind === "B_BREAKOUT_HOLD");

      expect(patternB?.matched).toBe(true);
    });

    it("treats a non positive 20 bar high as an unbounded extension", () => {
      const patterns = detectPatterns(
        makeTrendMetrics(),
        breakoutPrimary({ high20: 0, close: 10, volumeRatio: 2 }),
      );
      const patternB = patterns.find((pattern) => pattern.kind === "B_BREAKOUT_HOLD");

      expect(patternB?.matched).toBe(false);
    });
  });

  describe("pattern C", () => {
    it("matches an orderly continuation near the mean", () => {
      const patterns = detectPatterns(null, continuationPrimary());
      const patternC = patterns.find((pattern) => pattern.kind === "C_TREND_CONTINUATION");

      expect(patternC).toEqual({
        kind: "C_TREND_CONTINUATION",
        label: "价格连续抬高低点，EMA21 保持上行",
        matched: true,
      });
    });

    it("rejects C without a higher high", () => {
      const patterns = detectPatterns(null, continuationPrimary({ higherHigh: false }));
      const patternC = patterns.find((pattern) => pattern.kind === "C_TREND_CONTINUATION");

      expect(patternC?.matched).toBe(false);
    });

    it("rejects C without a higher low", () => {
      const patterns = detectPatterns(null, continuationPrimary({ higherLow: false }));
      const patternC = patterns.find((pattern) => pattern.kind === "C_TREND_CONTINUATION");

      expect(patternC?.matched).toBe(false);
    });

    it("rejects C when EMA21 is not rising", () => {
      const patterns = detectPatterns(null, continuationPrimary({ ema21Slope: -0.2 }));
      const patternC = patterns.find((pattern) => pattern.kind === "C_TREND_CONTINUATION");

      expect(patternC?.matched).toBe(false);
    });

    it("accepts C at exactly 1.5 ATR from EMA21", () => {
      const patterns = detectPatterns(null, continuationPrimary({ distanceFromEma21Atr: 1.5 }));
      const patternC = patterns.find((pattern) => pattern.kind === "C_TREND_CONTINUATION");

      expect(patternC?.matched).toBe(true);
    });

    it("rejects C past 1.5 ATR from EMA21", () => {
      const patterns = detectPatterns(null, continuationPrimary({ distanceFromEma21Atr: 1.51 }));
      const patternC = patterns.find((pattern) => pattern.kind === "C_TREND_CONTINUATION");

      expect(patternC?.matched).toBe(false);
    });
  });

  it("appends a NONE marker when nothing matches", () => {
    const patterns = detectPatterns(
      makeTrendMetrics({ ema9: 96 }),
      makeMetrics({
        close: 95,
        ema21: 98,
        ema21Slope: 0,
        volumeRatio: 0.8,
        higherHigh: false,
        higherLow: false,
        distanceFromEma21Atr: 3,
      }),
    );

    expect(patterns).toHaveLength(4);
    expect(patterns.at(-1)).toEqual({
      kind: "NONE",
      label: "未识别到 A / B / C 形态",
      matched: false,
    });
  });

  it("keeps A, B and C in priority order even when several match", () => {
    const patterns = detectPatterns(
      makeTrendMetrics(),
      breakoutPrimary({ close: 106, high20: 105, volumeRatio: 2, distanceFromEma21Atr: 0.6 }),
    );

    expect(patterns.map((pattern) => pattern.kind)).toEqual([
      "A_EMA21_PULLBACK_RECLAIM",
      "B_BREAKOUT_HOLD",
      "C_TREND_CONTINUATION",
    ]);
    expect(patterns.filter((pattern) => pattern.matched).length).toBeGreaterThan(1);
  });
});

describe("bestPattern", () => {
  it("prefers the highest priority matched pattern", () => {
    const patterns = detectPatterns(makeTrendMetrics(), makeMetrics());

    expect(bestPattern(patterns).kind).toBe("A_EMA21_PULLBACK_RECLAIM");
  });

  it("falls back to the NONE entry already present in the list", () => {
    const patterns = detectPatterns(
      makeTrendMetrics({ ema9: 96 }),
      makeMetrics({
        close: 95,
        ema21: 98,
        ema21Slope: 0,
        volumeRatio: 0.8,
        higherHigh: false,
        higherLow: false,
        distanceFromEma21Atr: 3,
      }),
    );

    expect(bestPattern(patterns)).toEqual({
      kind: "NONE",
      label: "未识别到 A / B / C 形态",
      matched: false,
    });
  });

  it("synthesises a NONE marker for an empty list", () => {
    expect(bestPattern([])).toEqual({
      kind: "NONE",
      label: "未识别到 A / B / C 形态",
      matched: false,
    });
  });

  it("ignores a matched entry that is not first", () => {
    const patterns = detectPatterns(null, continuationPrimary());

    expect(bestPattern(patterns).kind).toBe("C_TREND_CONTINUATION");
  });
});
