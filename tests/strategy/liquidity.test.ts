import { describe, expect, it } from "vitest";

import { LIQUIDITY_BANDS, SCAN_CONFIG } from "@/config/strategy";
import {
  buildLiquidityCandidates,
  isSpreadTradable,
  judgeSpread,
  liquidityPoints,
  passesVolumeFloor,
  selectTechnicalScanSet,
  type LiquidityCandidate,
} from "@/strategy/liquidity";
import { makeBook, makeTicker } from "../fixtures/market";

/** Book whose spread works out to exactly `pct` percent of a 100 mid price. */
function bookWithSpread(symbol: string, pct: number) {
  const half = (100 * pct) / 200;
  return makeBook({
    symbol,
    bidPrice: 100 - half,
    askPrice: 100 + half,
  });
}

/** Candidate helper so ordering tests stay readable. */
function makeCandidate(
  symbol: string,
  quoteVolume24h: number,
  spread: number | null,
): LiquidityCandidate {
  return {
    symbol,
    quoteVolume24h,
    lastPrice: 100,
    priceChangePercent: 1,
    highPrice: 102,
    lowPrice: 98,
    spreadPct: spread,
    spreadVerdict: judgeSpread(spread),
    liquidityPoints: liquidityPoints(quoteVolume24h),
  };
}

describe("passesVolumeFloor", () => {
  it("accepts a volume exactly on the floor", () => {
    expect(passesVolumeFloor(SCAN_CONFIG.minQuoteVolume24h)).toBe(true);
  });

  it("rejects a volume just below the floor", () => {
    expect(passesVolumeFloor(SCAN_CONFIG.minQuoteVolume24h - 0.01)).toBe(false);
  });

  it("rejects non-finite volumes", () => {
    expect(passesVolumeFloor(Number.NaN)).toBe(false);
    expect(passesVolumeFloor(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("rejects a zero volume", () => {
    expect(passesVolumeFloor(0)).toBe(false);
  });
});

describe("liquidityPoints", () => {
  it("awards the top band at and above 50M", () => {
    expect(liquidityPoints(50_000_000)).toBe(10);
    expect(liquidityPoints(9_999_999_999)).toBe(10);
  });

  it("steps down across every configured band", () => {
    expect(liquidityPoints(20_000_000)).toBe(8);
    expect(liquidityPoints(10_000_000)).toBe(6);
    expect(liquidityPoints(5_000_000)).toBe(4);
  });

  it("awards nothing below the lowest band", () => {
    expect(liquidityPoints(4_999_999)).toBe(0);
    expect(liquidityPoints(0)).toBe(0);
  });

  it("never returns a score for a non-finite volume", () => {
    expect(liquidityPoints(Number.NaN)).toBe(0);
    expect(liquidityPoints(Number.POSITIVE_INFINITY)).toBe(10);
  });

  it("keeps the band table ordered from richest to poorest", () => {
    const volumes = LIQUIDITY_BANDS.map((band) => band.minQuoteVolume);
    const sorted = [...volumes].sort((a, b) => b - a);
    expect(volumes).toEqual(sorted);
    const points = LIQUIDITY_BANDS.map((band) => band.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });
});

describe("judgeSpread", () => {
  it("rejects a missing spread", () => {
    expect(judgeSpread(null)).toBe("REJECTED");
  });

  it("rejects a non-finite spread", () => {
    expect(judgeSpread(Number.NaN)).toBe("REJECTED");
    expect(judgeSpread(Number.POSITIVE_INFINITY)).toBe("REJECTED");
  });

  it("prefers a spread at or under the preferred cap", () => {
    expect(judgeSpread(0)).toBe("PREFERRED");
    expect(judgeSpread(SCAN_CONFIG.preferredSpreadPct)).toBe("PREFERRED");
  });

  it("accepts a spread between the preferred and max caps", () => {
    expect(judgeSpread(SCAN_CONFIG.preferredSpreadPct + 0.0001)).toBe("ACCEPTABLE");
    expect(judgeSpread(SCAN_CONFIG.maxSpreadPct)).toBe("ACCEPTABLE");
  });

  it("rejects a spread above the max cap", () => {
    expect(judgeSpread(SCAN_CONFIG.maxSpreadPct + 0.0001)).toBe("REJECTED");
    expect(judgeSpread(5)).toBe("REJECTED");
  });
});

describe("isSpreadTradable", () => {
  it("mirrors the verdict, rejecting only REJECTED spreads", () => {
    expect(isSpreadTradable(0.1)).toBe(true);
    expect(isSpreadTradable(0.5)).toBe(true);
    expect(isSpreadTradable(0.6)).toBe(true);
    expect(isSpreadTradable(0.61)).toBe(false);
    expect(isSpreadTradable(null)).toBe(false);
  });
});

describe("buildLiquidityCandidates", () => {
  it("drops tickers below the volume floor", () => {
    const candidates = buildLiquidityCandidates(
      [
        makeTicker({ symbol: "BIGUSDT", quoteVolume: 80_000_000 }),
        makeTicker({ symbol: "TINYUSDT", quoteVolume: 1_000_000 }),
      ],
      [makeBook({ symbol: "BIGUSDT" }), makeBook({ symbol: "TINYUSDT" })],
    );
    expect(candidates.map((candidate) => candidate.symbol)).toEqual(["BIGUSDT"]);
  });

  it("sorts survivors by descending 24h quote volume", () => {
    const candidates = buildLiquidityCandidates(
      [
        makeTicker({ symbol: "MIDUSDT", quoteVolume: 20_000_000 }),
        makeTicker({ symbol: "TOPUSDT", quoteVolume: 90_000_000 }),
        makeTicker({ symbol: "LOWUSDT", quoteVolume: 6_000_000 }),
      ],
      [],
    );
    expect(candidates.map((candidate) => candidate.symbol)).toEqual([
      "TOPUSDT",
      "MIDUSDT",
      "LOWUSDT",
    ]);
  });

  it("records a null spread when no book ticker exists", () => {
    const candidates = buildLiquidityCandidates(
      [makeTicker({ symbol: "NOBOOKUSDT", quoteVolume: 50_000_000 })],
      [makeBook({ symbol: "OTHERUSDT" })],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].spreadPct).toBeNull();
    expect(candidates[0].spreadVerdict).toBe("REJECTED");
  });

  it("derives the spread from the joined book ticker", () => {
    const candidates = buildLiquidityCandidates(
      [makeTicker({ symbol: "BTCUSDT", quoteVolume: 50_000_000 })],
      [bookWithSpread("BTCUSDT", 0.5)],
    );
    expect(candidates[0].spreadPct).toBeCloseTo(0.5, 6);
    expect(candidates[0].spreadVerdict).toBe("ACCEPTABLE");
  });

  it("marks an untradeable book as REJECTED", () => {
    const candidates = buildLiquidityCandidates(
      [makeTicker({ symbol: "WIDEUSDT", quoteVolume: 50_000_000 })],
      [bookWithSpread("WIDEUSDT", 0.9)],
    );
    expect(candidates[0].spreadVerdict).toBe("REJECTED");
  });

  it("carries price fields and liquidity points through from the ticker", () => {
    const candidates = buildLiquidityCandidates(
      [
        makeTicker({
          symbol: "ETHUSDT",
          quoteVolume: 25_000_000,
          lastPrice: 3_000,
          priceChangePercent: 4.2,
          highPrice: 3_100,
          lowPrice: 2_900,
        }),
      ],
      [makeBook({ symbol: "ETHUSDT" })],
    );
    expect(candidates[0]).toMatchObject({
      symbol: "ETHUSDT",
      quoteVolume24h: 25_000_000,
      lastPrice: 3_000,
      priceChangePercent: 4.2,
      highPrice: 3_100,
      lowPrice: 2_900,
      liquidityPoints: 8,
    });
  });

  it("returns an empty list when nothing clears the funnel", () => {
    expect(buildLiquidityCandidates([], [])).toEqual([]);
    expect(
      buildLiquidityCandidates([makeTicker({ quoteVolume: 0 })], [makeBook()]),
    ).toEqual([]);
  });
});

describe("selectTechnicalScanSet", () => {
  it("keeps only tradable spreads", () => {
    const selected = selectTechnicalScanSet([
      makeCandidate("AAAUSDT", 90_000_000, 0.1),
      makeCandidate("BBBUSDT", 80_000_000, null),
      makeCandidate("CCCUSDT", 70_000_000, 0.9),
      makeCandidate("DDDUSDT", 60_000_000, 0.6),
    ]);
    expect(selected.map((candidate) => candidate.symbol)).toEqual([
      "AAAUSDT",
      "DDDUSDT",
    ]);
  });

  it("truncates to the universe size by default", () => {
    const candidates = Array.from({ length: SCAN_CONFIG.universeSize + 25 }, (_, index) =>
      makeCandidate(`SYM${index}USDT`, 100_000_000 - index * 1_000, 0.1),
    );
    const selected = selectTechnicalScanSet(candidates);
    expect(selected).toHaveLength(SCAN_CONFIG.universeSize);
    expect(selected[0].symbol).toBe("SYM0USDT");
    expect(selected.at(-1)?.symbol).toBe(`SYM${SCAN_CONFIG.universeSize - 1}USDT`);
  });

  it("honours an explicit limit and never mutates the input", () => {
    const input = [
      makeCandidate("AAAUSDT", 90_000_000, 0.1),
      makeCandidate("BBBUSDT", 80_000_000, 0.2),
      makeCandidate("CCCUSDT", 70_000_000, 0.3),
    ];
    const snapshot = input.map((candidate) => candidate.symbol);

    expect(selectTechnicalScanSet(input, 2).map((candidate) => candidate.symbol)).toEqual([
      "AAAUSDT",
      "BBBUSDT",
    ]);
    expect(input.map((candidate) => candidate.symbol)).toEqual(snapshot);
  });

  it("treats a zero limit as an empty scan set", () => {
    expect(selectTechnicalScanSet([makeCandidate("AAAUSDT", 90_000_000, 0.1)], 0)).toEqual([]);
  });
});
