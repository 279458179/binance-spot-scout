import { describe, expect, it } from "vitest";
import {
  atr,
  closes,
  ema,
  emaSeries,
  highest,
  highs,
  lowest,
  lows,
  macd,
  mean,
  median,
  normalisedSlope,
  pctChange,
  rsi,
  sma,
  smaSeries,
  volumes,
  vwap,
  wickRatios,
} from "@/lib/indicators";
import { makeKline, makeKlines } from "../fixtures/market";

describe("sma", () => {
  it("averages the trailing window", () => {
    expect(sma([1, 2, 3, 4], 2)).toBeCloseTo(3.5, 10);
    expect(sma([1, 2, 3, 4], 4)).toBeCloseTo(2.5, 10);
  });

  it("returns null when the window is not satisfiable", () => {
    expect(sma([1, 2], 3)).toBeNull();
    expect(sma([], 1)).toBeNull();
    expect(sma([1, 2, 3], 0)).toBeNull();
    expect(sma([1, 2, 3], 1.5)).toBeNull();
  });

  it("keeps smaSeries aligned with the input and null-prefixed", () => {
    expect(smaSeries([2, 4, 6, 8], 2)).toEqual([null, 3, 5, 7]);
    expect(smaSeries([1, 2], 5)).toEqual([null, null]);
    expect(smaSeries([1, 2], -1)).toEqual([null, null]);
  });
});

describe("ema", () => {
  it("seeds with the SMA of the first period values", () => {
    const series = emaSeries([1, 2, 3, 4, 5], 3);
    expect(series[0]).toBeNull();
    expect(series[1]).toBeNull();
    expect(series[2]).toBeCloseTo(2, 10);
    expect(series[3]).toBeCloseTo(3, 10);
    expect(series[4]).toBeCloseTo(4, 10);
  });

  it("returns null when there is not enough history", () => {
    expect(ema([1, 2], 3)).toBeNull();
    expect(emaSeries([1, 2], 3)).toEqual([null, null]);
    expect(emaSeries([1, 2, 3], 0)).toEqual([null, null, null]);
  });

  it("tracks faster than SMA on a rising series", () => {
    const values = Array.from({ length: 40 }, (_, i) => 100 + i);
    const fast = ema(values, 9);
    const slow = sma(values, 20);
    expect(fast).not.toBeNull();
    expect(slow).not.toBeNull();
    expect(fast as number).toBeGreaterThan(slow as number);
  });
});

describe("rsi", () => {
  it("returns 100 for a monotonic rise and 50 for a flat series", () => {
    const rising = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(rsi(rising)).toBeCloseTo(100, 6);
    const flat = new Array(20).fill(100);
    expect(rsi(flat)).toBeCloseTo(50, 6);
  });

  it("returns 0 for a monotonic fall", () => {
    const falling = Array.from({ length: 20 }, (_, i) => 200 - i);
    expect(rsi(falling)).toBeCloseTo(0, 6);
  });

  it("needs period + 1 values", () => {
    expect(rsi([1, 2, 3], 14)).toBeNull();
    expect(rsi(Array.from({ length: 15 }, (_, i) => 100 + i), 14)).not.toBeNull();
  });

  it("stays inside the 0-100 band on noisy input", () => {
    const noisy = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i) * 5);
    const value = rsi(noisy);
    expect(value).not.toBeNull();
    expect(value as number).toBeGreaterThanOrEqual(0);
    expect(value as number).toBeLessThanOrEqual(100);
  });
});

describe("macd", () => {
  it("returns nulls below the warm-up length", () => {
    const short = Array.from({ length: 34 }, (_, i) => 100 + i);
    expect(macd(short)).toEqual({ macdLine: null, signal: null, histogram: null });
  });

  it("computes a positive histogram on an accelerating uptrend", () => {
    const values = Array.from({ length: 80 }, (_, i) => 100 * 1.01 ** i);
    const result = macd(values);
    expect(result.macdLine).not.toBeNull();
    expect(result.signal).not.toBeNull();
    expect(result.histogram).not.toBeNull();
    expect(result.macdLine as number).toBeGreaterThan(0);
    expect(result.histogram as number).toBeGreaterThan(0);
  });

  it("keeps histogram consistent with line minus signal", () => {
    const values = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 5) * 10 + i * 0.2);
    const result = macd(values);
    expect(result.histogram).toBeCloseTo(
      (result.macdLine as number) - (result.signal as number),
      10,
    );
  });

  it("starts producing a signal exactly at the slow + signal warm-up length", () => {
    const atBoundary = Array.from({ length: 35 }, (_, i) => 100 + i);
    const boundary = macd(atBoundary);
    expect(boundary.macdLine).not.toBeNull();
    expect(boundary.signal).not.toBeNull();
    expect(boundary.histogram).not.toBeNull();
  });
});

describe("atr", () => {
  it("needs period + 1 bars", () => {
    const klines = makeKlines("15m", 14, { close: 100, drift: 0 });
    expect(atr(highs(klines), lows(klines), closes(klines), 14)).toBeNull();
  });

  it("averages true ranges including gap-aware bands", () => {
    const highsArr = [10, 12, 13, 15];
    const lowsArr = [8, 9, 11, 12];
    const closesArr = [9, 11, 12, 14];
    expect(atr(highsArr, lowsArr, closesArr, 3)).toBeCloseTo((3 + 2 + 3) / 3, 10);
  });

  it("is positive on a volatile fixture series", () => {
    const klines = makeKlines("1h", 80, { close: 100, drift: 0.5, bodyPct: 1.2 });
    const value = atr(highs(klines), lows(klines), closes(klines), 14);
    expect(value).not.toBeNull();
    expect(value as number).toBeGreaterThan(0);
  });
});

describe("aggregate helpers", () => {
  it("computes mean and median without mutating input", () => {
    const values = [5, 1, 3];
    expect(mean(values)).toBeCloseTo(3, 10);
    expect(median(values)).toBeCloseTo(3, 10);
    expect(values).toEqual([5, 1, 3]);
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
  });

  it("averages the two middle values for even-length medians", () => {
    expect(median([1, 2, 3, 4])).toBeCloseTo(2.5, 10);
  });

  it("scans the trailing window for extremes", () => {
    const values = [1, 9, 3, 4];
    expect(highest(values, 2)).toBeCloseTo(4, 10);
    expect(lowest(values, 2)).toBeCloseTo(3, 10);
    expect(highest(values, 5)).toBeNull();
    expect(lowest(values, 0)).toBeNull();
  });
});

describe("pctChange", () => {
  it("returns the signed percentage move", () => {
    expect(pctChange(100, 105)).toBeCloseTo(5, 10);
    expect(pctChange(100, 96)).toBeCloseTo(-4, 10);
  });

  it("returns null for unusable bases", () => {
    expect(pctChange(0, 10)).toBeNull();
    expect(pctChange(-5, 10)).toBeNull();
    expect(pctChange(Number.NaN, 10)).toBeNull();
    expect(pctChange(10, Number.NaN)).toBeNull();
  });
});

describe("vwap", () => {
  it("uses the typical price weighted by volume", () => {
    const klines = makeKlines("15m", 20, { close: 100, drift: 0, volume: 10 });
    const value = vwap(klines, 20);
    expect(value).not.toBeNull();
    expect(value as number).toBeGreaterThan(0);
  });

  it("returns null when the window has no volume or not enough bars", () => {
    const zeroVolume = makeKlines("15m", 20, { close: 100, drift: 0, volume: 0 });
    expect(vwap(zeroVolume, 20)).toBeNull();
    expect(vwap(zeroVolume, 21)).toBeNull();
  });

  it("weights a high-volume bar far above the rest", () => {
    const klines = makeKlines("15m", 20, { close: 100, drift: 0, volume: 1 });
    const last = klines[klines.length - 1];
    klines[klines.length - 1] = {
      ...last,
      high: 200,
      low: 200,
      close: 200,
      volume: 1000,
    };
    const value = vwap(klines, 20) as number;
    expect(value).toBeGreaterThan(190);
  });
});

describe("wickRatios", () => {
  it("splits the range into upper and lower wicks", () => {
    const ratios = wickRatios(makeKline({ open: 10, high: 14, low: 8, close: 12 }));
    expect(ratios.upper).toBeCloseTo(2 / 6, 10);
    expect(ratios.lower).toBeCloseTo(2 / 6, 10);
  });

  it("returns zeroes for a zero-range candle", () => {
    const ratios = wickRatios(makeKline({ open: 10, high: 10, low: 10, close: 10 }));
    expect(ratios).toEqual({ upper: 0, lower: 0 });
  });

  it("reports a dominant lower wick on a hammer", () => {
    const ratios = wickRatios(makeKline({ open: 10, high: 11, low: 5, close: 10.5 }));
    expect(ratios.lower).toBeGreaterThan(0.5);
    expect(ratios.upper).toBeLessThan(0.5);
  });
});

describe("normalisedSlope", () => {
  it("returns the percentage slope over the lookback", () => {
    const series = [100, 101, 102, 110];
    expect(normalisedSlope(series, 3)).toBeCloseTo(10, 10);
    expect(normalisedSlope(series, 1)).toBeCloseTo((110 / 102 - 1) * 100, 10);
  });

  it("returns null when history or anchors are missing", () => {
    expect(normalisedSlope([1, 2], 3)).toBeNull();
    expect(normalisedSlope([null, null, null, 5], 3)).toBeNull();
    expect(normalisedSlope([0, 1, 2, 5], 3)).toBeNull();
  });
});

describe("series extractors", () => {
  it("projects the requested price fields", () => {
    const klines = makeKlines("15m", 3, { close: 100, drift: 1 });
    expect(closes(klines)).toHaveLength(3);
    expect(volumes(klines)).toHaveLength(3);
    expect(highs(klines)).toHaveLength(3);
    expect(lows(klines)).toHaveLength(3);
    for (const kline of klines) {
      expect(kline.high).toBeGreaterThanOrEqual(kline.close);
      expect(kline.low).toBeLessThanOrEqual(kline.close);
    }
    expect(closes(klines)).toEqual(klines.map((k) => k.close));
  });
});
