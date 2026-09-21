import { describe, expect, it } from "vitest";

import type { Kline } from "@/shared/types";
import { detectSupportResistance } from "@/strategy/support-resistance";

/** One synthetic candle; high/low default to the close so pivots stay explicit. */
function bar(index: number, close: number, high = close, low = close): Kline {
  return {
    openTime: index * 60_000,
    open: close,
    high,
    low,
    close,
    volume: 1_000,
    closeTime: (index + 1) * 60_000,
    quoteVolume: 1_000,
    trades: 10,
    takerBuyBase: 500,
    takerBuyQuote: 500,
  };
}

/** A run of identical candles: no strict pivot can exist inside it. */
function flat(count: number, high = 101, low = 99, close = 100): Kline[] {
  return Array.from({ length: count }, (_, index) => bar(index, close, high, low));
}

/** Closes alternate 100/101 so the final close differs from the extremes. */
function alternating(count: number): Kline[] {
  return Array.from({ length: count }, (_, index) => bar(index, index % 2 === 0 ? 100 : 101));
}

describe("detectSupportResistance", () => {
  it("returns null when there are fewer bars than the minimum", () => {
    expect(detectSupportResistance([])).toBeNull();
    expect(detectSupportResistance(flat(59))).toBeNull();
  });

  it("returns a level map once the bar minimum is met", () => {
    expect(detectSupportResistance(flat(60))).not.toBeNull();
  });

  it("returns null when the last close is not a usable price", () => {
    for (const close of [Number.NaN, Number.POSITIVE_INFINITY, 0, -12.5]) {
      const klines = flat(60);
      klines[59] = bar(59, 100);
      klines[59] = { ...klines[59], close };

      expect(detectSupportResistance(klines), String(close)).toBeNull();
    }
  });

  it("falls back to the twenty-bar range on a perfectly flat market", () => {
    const result = detectSupportResistance(flat(60));

    expect(result).not.toBeNull();
    expect(result?.support).toBe(99);
    expect(result?.resistance).toBe(101);
    expect(result?.distanceToResistancePct).toBeCloseTo(1, 10);
    expect(result?.distanceToSupportPct).toBeCloseTo(1, 10);
    expect(result?.targetBlocked).toBe(true);
    expect(result?.method).toBe("TWENTY_BAR_HIGH");
  });

  it("scales both levels with atr when no pivot or range exists", () => {
    const result = detectSupportResistance(alternating(60));

    expect(result?.support).toBe(100);
    expect(result?.resistance).toBe(104);
    expect(result?.distanceToResistancePct).toBeCloseTo(2.9702970297029703, 10);
    expect(result?.distanceToSupportPct).toBeCloseTo(0.9900990099009901, 10);
    expect(result?.targetBlocked).toBe(true);
    expect(result?.method).toBe("ATR_ESTIMATE");
  });

  it("keeps an atr estimate as the resistance while support keeps its own method", () => {
    const klines = alternating(60);
    klines[59] = bar(59, 100);

    const result = detectSupportResistance(klines);

    expect(result?.support).toBeCloseTo(97.21428571428571, 10);
    expect(result?.resistance).toBe(101);
    expect(result?.distanceToResistancePct).toBeCloseTo(1, 10);
    expect(result?.distanceToSupportPct).toBeCloseTo(2.785714285714292, 10);
    expect(result?.targetBlocked).toBe(true);
    expect(result?.method).toBe("ATR_SUPPORT_ESTIMATE");
  });

  it("picks the nearest swing pivot rather than the highest one", () => {
    const klines = flat(80);
    klines[60] = bar(60, 100, 103, 99);
    klines[70] = bar(70, 100, 106, 99);
    klines[75] = bar(75, 100, 104, 99);
    klines[50] = bar(50, 100, 101, 97);
    klines[65] = bar(65, 100, 101, 98.5);

    const result = detectSupportResistance(klines);

    expect(result?.support).toBe(98.5);
    expect(result?.resistance).toBe(103);
    expect(result?.distanceToResistancePct).toBeCloseTo(3, 10);
    expect(result?.distanceToSupportPct).toBeCloseTo(1.5, 10);
    expect(result?.targetBlocked).toBe(true);
    expect(result?.method).toBe("SWING_PIVOT");
  });

  it("ignores trailing bars that do not create new pivots", () => {
    const klines = flat(80);
    klines[60] = bar(60, 100, 103, 99);
    klines[70] = bar(70, 100, 106, 99);
    klines[75] = bar(75, 100, 104, 99);
    klines[50] = bar(50, 100, 101, 97);
    klines[65] = bar(65, 100, 101, 98.5);
    const extended = [...klines, bar(80, 100, 101, 99)];

    expect(detectSupportResistance(extended)).toEqual(detectSupportResistance(klines));
  });

  it("clamps the atr support estimate to half of the last price", () => {
    const klines = [...flat(40, 103, 101, 102), ...Array.from({ length: 20 }, (_, i) => bar(40 + i, 100, 130, 100))];

    const result = detectSupportResistance(klines);

    expect(result?.support).toBe(50);
    expect(result?.resistance).toBe(130);
    expect(result?.distanceToResistancePct).toBeCloseTo(30, 10);
    expect(result?.distanceToSupportPct).toBeCloseTo(50, 10);
    expect(result?.targetBlocked).toBe(false);
    expect(result?.method).toBe("ATR_SUPPORT_ESTIMATE");
  });

  it("estimates resistance from atr while support reuses the twenty-bar low", () => {
    const klines = [...flat(79, 99, 97, 98), bar(79, 100, 100, 99)];

    const result = detectSupportResistance(klines);

    expect(result?.support).toBe(97);
    expect(result?.resistance).toBe(106);
    expect(result?.distanceToResistancePct).toBeCloseTo(6, 10);
    expect(result?.distanceToSupportPct).toBeCloseTo(3, 10);
    expect(result?.targetBlocked).toBe(false);
    expect(result?.method).toBe("ATR_ESTIMATE");
  });

  it("estimates support from atr when the twenty-bar low sits above the price", () => {
    const klines = [...flat(79, 103, 101, 102), bar(79, 100, 101, 100)];

    const result = detectSupportResistance(klines);

    expect(result?.support).toBe(94);
    expect(result?.resistance).toBe(103);
    expect(result?.distanceToResistancePct).toBeCloseTo(3, 10);
    expect(result?.distanceToSupportPct).toBeCloseTo(6, 10);
    expect(result?.targetBlocked).toBe(true);
    expect(result?.method).toBe("ATR_SUPPORT_ESTIMATE");
  });

  it("discards pivots older than the maximum age", () => {
    const klines = flat(120);
    klines[5] = bar(5, 100, 120, 99);

    const result = detectSupportResistance(klines);

    expect(result?.support).toBe(99);
    expect(result?.resistance).toBe(101);
    expect(result?.distanceToResistancePct).toBeCloseTo(1, 10);
    expect(result?.distanceToSupportPct).toBeCloseTo(1, 10);
    expect(result?.targetBlocked).toBe(true);
    expect(result?.method).toBe("TWENTY_BAR_HIGH");
  });

  it("treats an existing swing high as untouched when it sits above the target", () => {
    const klines = flat(60);
    klines[55] = bar(55, 100, 105, 99);

    const result = detectSupportResistance(klines);

    expect(result?.resistance).toBe(105);
    expect(result?.distanceToResistancePct).toBeCloseTo(5, 10);
    expect(result?.targetBlocked).toBe(false);
    expect(result?.method).toBe("SWING_PIVOT");
  });

  it("blocks the target when resistance sits just below the target distance", () => {
    const klines = flat(60);
    klines[55] = bar(55, 100, 104.9, 99);

    const result = detectSupportResistance(klines);

    expect(result?.resistance).toBe(104.9);
    expect(result?.distanceToResistancePct).toBeCloseTo(4.9, 10);
    expect(result?.targetBlocked).toBe(true);
    expect(result?.method).toBe("SWING_PIVOT");
  });

  it("does not count equal highs as swing pivots", () => {
    const klines = flat(60, 101, 99, 100);
    klines[30] = bar(30, 100, 111, 99);
    klines[31] = bar(31, 100, 111, 99);

    const result = detectSupportResistance(klines);

    // The twin highs never qualify as a strict pivot, so the 111 level is
    // invisible: only the twenty-bar window above the price remains.
    expect(result?.resistance).toBe(101);
    expect(result?.method).toBe("TWENTY_BAR_HIGH");
  });
});
