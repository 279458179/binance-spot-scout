import { describe, expect, it } from "vitest";
import type { Kline } from "@/shared/types";
import { analyzeGrid, type GridInput } from "@/strategy/grid-radar";

const NOW = Date.UTC(2026, 9, 8, 6, 45, 0);
function series(hours: number, fn: (index: number) => number): Kline[] {
  const ms = hours * 60 * 60 * 1000;
  const end = Math.floor(NOW / ms) * ms - 1;
  const out: Kline[] = [];
  for (let i = 0; i < 120; i += 1) {
    const close = fn(i);
    const openTime = end - (120 - i) * ms + 1;
    out.push({
      openTime, closeTime: openTime + ms - 1,
      open: close, high: close + 0.8, low: close - 0.8,
      close, volume: 100, quoteVolume: 10_000, trades: 50,
      takerBuyBase: 50, takerBuyQuote: 5000,
    });
  }
  return out;
}
function market(overrides: Partial<GridInput> = {}): GridInput {
  const side = (i: number) => 100 + Math.sin(i * Math.PI / 5);
  return {
    symbol: "BTCUSDT", market: "spot", now: NOW, budgetUsdt: 100,
    price: 100, quoteVolume24h: 100_000_000, change24hPct: 0.3,
    fundingRate: null, candles1h: series(1, side), candles4h: series(4, side),
    ...overrides,
  };
}

describe("grid opportunity research", () => {
  it("returns a bounded research grid only for valid sideways spot data", () => {
    const r = analyzeGrid(market());
    expect(r.decision).toBe("CANDIDATE");
    expect(r.plan).not.toBeNull();
    expect(r.plan?.count).toBeGreaterThanOrEqual(6);
    expect(r.plan?.lower).toBeLessThan(100);
    expect(r.plan?.upper).toBeGreaterThan(100);
    expect(r.plan?.estimatedNetStepPct).toBeGreaterThan(0);
  });

  it("does not overfit budget when notional is too small", () => {
    const r = analyzeGrid(market({ budgetUsdt: 10 }));
    expect(r.decision).toBe("AVOID");
    expect(r.plan).toBeNull();
  });

  it("does not recommend a neutral grid in a strong downtrend", () => {
    const down = (i: number) => 140 - i * 0.3;
    const r = analyzeGrid(market({
      price: down(119), change24hPct: -2.5,
      candles1h: series(1, down), candles4h: series(4, down),
    }));
    expect(r.decision).toBe("AVOID");
    expect(r.plan).toBeNull();
  });

  it("never gives a futures grid when funding rate is excessive", () => {
    const r = analyzeGrid(market({ market: "futures", fundingRate: 0.001 }));
    expect(r.decision).toBe("AVOID");
    expect(r.plan).toBeNull();
  });

  it("fails closed when futures funding is unavailable", () => {
    const r = analyzeGrid(market({ market: "futures", fundingRate: null }));
    expect(r.decision).toBe("UNAVAILABLE");
    expect(r.plan).toBeNull();
  });

  it("fails closed when candle timestamps are stale", () => {
    const r = analyzeGrid(market({ now: NOW + 13 * 60 * 60_000 }));
    expect(r.decision).toBe("UNAVAILABLE");
  });

  it("fails closed on missing 4h candles", () => {
    const r = analyzeGrid(market({ candles4h: [] }));
    expect(r.decision).toBe("UNAVAILABLE");
  });

  it("fails closed on missing candles inside a supposedly complete window", () => {
    const invalid = series(1, (i) => 100 + Math.sin(i * Math.PI / 5));
    invalid.splice(70, 1);
    const r = analyzeGrid(market({ candles1h: invalid }));
    expect(r.decision).toBe("UNAVAILABLE");
  });

  it("never fabricates a candidate on invalid price data", () => {
    const r = analyzeGrid(market({ price: Number.NaN }));
    expect(r.decision).toBe("UNAVAILABLE");
  });
});
