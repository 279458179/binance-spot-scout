import { describe, expect, it } from "vitest";
import { atr, vwap } from "@/lib/indicators";
import {
  buildIntervalMetrics,
  detectHigherHigh,
  detectHigherLow,
  medianCandleMovePct,
} from "@/lib/indicators/metrics";
import { THRESHOLDS } from "@/config/strategy";
import type { Kline } from "@/shared/types";
import { makeKline, makeKlines } from "../fixtures/market";

function klinesFromCloses(closes: number[]): Kline[] {
  return closes.map((close, index) =>
    makeKline({ openTime: index, closeTime: index + 1, close }),
  );
}

describe("buildIntervalMetrics", () => {
  it("rejects histories shorter than the minimum bar count", () => {
    const short = makeKlines("15m", THRESHOLDS.minBars - 1, { close: 100 });
    expect(buildIntervalMetrics("15m", short)).toBeNull();

    const exact = makeKlines("15m", THRESHOLDS.minBars, { close: 100 });
    expect(buildIntervalMetrics("15m", exact)).not.toBeNull();

    expect(buildIntervalMetrics("15m", [])).toBeNull();
  });

  it("produces a complete snapshot for an uptrend", () => {
    const klines = makeKlines("15m", 120, {
      close: 100,
      drift: 0.001,
      volume: 1_000,
      finalVolume: 2_000,
    });
    const metrics = buildIntervalMetrics("15m", klines);

    expect(metrics).not.toBeNull();
    if (metrics === null) return;

    expect(metrics.interval).toBe("15m");
    expect(metrics.close).toBeCloseTo(100, 8);

    // Rising series: the fast average leads the slow one.
    expect(metrics.ema9).toBeGreaterThan(metrics.ema21);
    expect(metrics.ema21).toBeGreaterThan(metrics.ema55);
    expect(metrics.ema21Slope).toBeGreaterThan(0);
    expect(metrics.ema55Slope).toBeGreaterThan(0);

    expect(metrics.rsi14).toBeGreaterThan(50);
    expect(metrics.rsi14).toBeLessThanOrEqual(100);
    expect(metrics.macdHistogram).toBe(metrics.macdLine - metrics.macdSignal);

    expect(metrics.atr14).toBeGreaterThan(0);
    expect(metrics.atrPct).toBeCloseTo((metrics.atr14 / metrics.close) * 100, 10);
    expect(metrics.atrPct).toBeCloseTo(
      (atr(klines.map((k) => k.high), klines.map((k) => k.low), klines.map((k) => k.close), 14) as number) /
        metrics.close *
        100,
      10,
    );

    expect(metrics.volumeSma20).toBeCloseTo((19 * 1_000 + 2_000) / 20, 8);
    expect(metrics.volumeRatio).toBeCloseTo(2_000 / 1_050, 10);

    expect(metrics.vwap).toBeCloseTo(vwap(klines, 20) as number, 10);
    expect(metrics.high20).toBeCloseTo(Math.max(...klines.slice(-20).map((k) => k.high)), 8);
    expect(metrics.low20).toBeCloseTo(Math.min(...klines.slice(-20).map((k) => k.low)), 8);

    expect(metrics.upperWickRatio).toBeGreaterThanOrEqual(0);
    expect(metrics.lowerWickRatio).toBeGreaterThanOrEqual(0);
    expect(metrics.distanceFromEma21Atr).toBeCloseTo(
      (metrics.close - metrics.ema21) / metrics.atr14,
      10,
    );
    expect(metrics.distanceFromEma21Atr).toBeGreaterThan(0);

    // Both structure flags follow the persistent uptrend.
    expect(metrics.higherHigh).toBe(true);
    expect(metrics.higherLow).toBe(true);
  });

  it("keeps the volume ratio at one for flat volume", () => {
    const klines = makeKlines("1h", 80, { close: 50, drift: 0.002, volume: 700 });
    const metrics = buildIntervalMetrics("1h", klines);

    expect(metrics).not.toBeNull();
    if (metrics === null) return;
    expect(metrics.volumeRatio).toBeCloseTo(1, 10);
  });

  it("falls back to the last close when vwap is unavailable", () => {
    const klines = makeKlines("15m", 70, { close: 100, drift: 0.001, volume: 0 });
    const metrics = buildIntervalMetrics("15m", klines);

    expect(metrics).not.toBeNull();
    if (metrics === null) return;
    expect(vwap(klines, 20)).toBeNull();
    expect(metrics.vwap).toBeCloseTo(metrics.close, 8);
    expect(metrics.volumeSma20).toBe(0);
    expect(metrics.volumeRatio).toBe(0);
  });

  it("handles a perfectly flat market without dividing by zero", () => {
    const flat = Array.from({ length: THRESHOLDS.minBars }, (_, index) =>
      makeKline({
        openTime: index,
        closeTime: index + 1,
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 1_000,
      }),
    );
    const metrics = buildIntervalMetrics("15m", flat);

    expect(metrics).not.toBeNull();
    if (metrics === null) return;
    expect(metrics.atr14).toBe(0);
    expect(metrics.atrPct).toBe(0);
    expect(metrics.distanceFromEma21Atr).toBe(0);
    expect(metrics.ema9).toBeCloseTo(100, 8);
    expect(metrics.ema21Slope).toBe(0);
    expect(metrics.rsi14).toBe(50);
    expect(metrics.macdHistogram).toBe(0);
    expect(metrics.macdHistogramPrev).toBe(0);
    expect(metrics.upperWickRatio).toBe(0);
    expect(metrics.lowerWickRatio).toBe(0);
    expect(metrics.higherHigh).toBe(false);
    expect(metrics.higherLow).toBe(false);
  });

  it("derives macdHistogramPrev from the prior candle", () => {
    const klines = makeKlines("15m", 90, { close: 120, drift: 0.0015, volume: 900 });
    const metrics = buildIntervalMetrics("15m", klines);

    expect(metrics).not.toBeNull();
    if (metrics === null) return;
    expect(Number.isFinite(metrics.macdHistogramPrev)).toBe(true);
    expect(metrics.macdHistogramPrev).not.toBe(metrics.macdHistogram);
  });
});

describe("detectHigherHigh", () => {
  it("returns false when there is not enough history", () => {
    expect(detectHigherHigh([1, 2, 3], 12)).toBe(false);
    expect(detectHigherHigh(Array.from({ length: 11 }, (_, i) => i), 12)).toBe(false);
  });

  it("compares the recent half against the prior half", () => {
    const rising = [1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15];
    const falling = [10, 11, 12, 13, 14, 15, 1, 2, 3, 4, 5, 6];

    expect(detectHigherHigh(rising, 12)).toBe(true);
    expect(detectHigherHigh(falling, 12)).toBe(false);
  });

  it("works with an odd lookback", () => {
    expect(detectHigherHigh([1, 2, 3, 4, 5], 5)).toBe(true);
    expect(detectHigherHigh([5, 4, 3, 2, 1], 5)).toBe(false);
  });

  it("returns false when the two halves are equal", () => {
    expect(detectHigherHigh([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], 12)).toBe(false);
  });
});

describe("detectHigherLow", () => {
  it("returns false when there is not enough history", () => {
    expect(detectHigherLow([1, 2, 3], 12)).toBe(false);
  });

  it("compares the recent half against the prior half", () => {
    const rising = [1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15];
    const falling = [10, 11, 12, 13, 14, 15, 1, 2, 3, 4, 5, 6];

    expect(detectHigherLow(rising, 12)).toBe(true);
    expect(detectHigherLow(falling, 12)).toBe(false);
  });

  it("returns false when lows are identical", () => {
    expect(detectHigherLow([7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7], 12)).toBe(false);
  });
});

describe("medianCandleMovePct", () => {
  it("returns zero when there is nothing to measure", () => {
    expect(medianCandleMovePct([])).toBe(0);
    expect(medianCandleMovePct(klinesFromCloses([100]))).toBe(0);
  });

  it("takes the middle move of an odd sample", () => {
    expect(medianCandleMovePct(klinesFromCloses([100, 200, 100, 200]))).toBeCloseTo(100, 10);
  });

  it("averages the two middle moves of an even sample", () => {
    expect(
      medianCandleMovePct(klinesFromCloses([100, 200, 200, 400, 400])),
    ).toBeCloseTo(50, 10);
  });

  it("is insensitive to direction", () => {
    const up = medianCandleMovePct(klinesFromCloses([100, 150]));
    const down = medianCandleMovePct(klinesFromCloses([100, 50]));
    expect(up).toBeCloseTo(50, 10);
    expect(down).toBeCloseTo(50, 10);
    expect(up).toBeCloseTo(down, 10);
  });

  it("skips candles whose previous close is not positive", () => {
    expect(medianCandleMovePct(klinesFromCloses([0, 100]))).toBe(0);
    expect(medianCandleMovePct(klinesFromCloses([0, 100, 200]))).toBeCloseTo(100, 10);
  });

  it("reads only the close price", () => {
    const klines = klinesFromCloses([100, 110, 121]);
    expect(medianCandleMovePct(klines)).toBeCloseTo(10, 8);
  });
});
