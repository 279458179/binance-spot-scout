import { describe, expect, it } from "vitest";

import {
  emptyDistribution,
  emptyForward,
  forwardStats,
  median,
  tickerFromKlines,
} from "../../scripts/backtest";

const baseKline = {
  openTime: 1,
  closeTime: 2,
  open: 100,
  high: 110,
  low: 95,
  close: 105,
  volume: 1,
  quoteVolume: 100,
  trades: 2,
  takerBuyBase: 0.5,
  takerBuyQuote: 50,
};

describe("full-universe backtest replay helpers", () => {
  it("rebuilds a trailing 24h ticker from closed candles", () => {
    const ticker = tickerFromKlines("BTCUSDT", [{ ...baseKline, close: 101 }, { ...baseKline, close: 106 }]);
    expect(ticker).toMatchObject({ symbol: "BTCUSDT", lastPrice: 106, openPrice: 100 });
    expect(ticker?.priceChangePercent).toBeCloseTo(6, 10);
  });

  it("counts both +3% and +5% forward hits independently", () => {
    const stats = emptyForward();
    forwardStats(100, Array.from({ length: 96 }, (_, index) => [
      { ...baseKline, high: 103, low: 98, close: 101 },
      { ...baseKline, high: 105.5, low: 99, close: 104 },
    ][Math.min(index, 1)]!), stats);
    expect(stats.eligible).toBe(1);
    expect(stats.hit3Pct).toBe(1);
    expect(stats.hit5Pct).toBe(1);
  });

  it("does not count an incomplete 24h forward window", () => {
    const stats = emptyForward();
    forwardStats(100, [{ ...baseKline, high: 103, low: 98, close: 101 }], stats);
    expect(stats.eligible).toBe(0);
    expect(stats.incomplete).toBe(1);
  });

  it("formats decision and statistic containers safely", () => {
    expect(emptyDistribution()).toEqual({ BUY_NOW: 0, BUY_ON_PULLBACK: 0, WATCH_ONLY: 0, MARKET_HALT: 0 });
    expect(median([1, 2, 3])).toBe(2);
  });
});
