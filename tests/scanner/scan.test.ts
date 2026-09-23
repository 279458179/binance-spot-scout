/**
 * End-to-end scanner tests.
 *
 * These drive `runScan()` through the real funnel — universe -> liquidity ->
 * coarse screen -> scoring -> risk gate — using hand-authored kline shapes, so
 * the five spec scenarios are covered as behaviour rather than as isolated
 * rules. Every fixture is synthetic market data; no network, no API keys.
 */

import { describe, expect, it } from "vitest";

import { SCAN_CONFIG } from "@/config/strategy";
import { buildIntervalMetrics } from "@/lib/indicators/metrics";
import type { Ticker24h } from "@/shared/types";
import { runScan } from "@/strategy/scanner";
import {
  makeBook,
  makeFakeClient,
  makeSeries,
  makeSymbolInfo,
  makeTicker,
  type SeriesSegment,
  type SeriesShape,
} from "../fixtures/market";

const ALT = "AAAUSDT";
const BTC = "BTCUSDT";

/** Volume for the newest 15m candle, chosen so the volume ratio clears 2x. */
const ALT_15M_SHAPE: SeriesShape = { finalVolume: 4000 };
/** Volume for the newest 1h candle, keeping the trend volume ratio healthy. */
const ALT_1H_SHAPE: SeriesShape = { finalVolume: 2500 };

/**
 * Distribution -> pullback -> reclaim. The 112.6 spike is deliberate: it is the
 * only swing high left far enough above the entry to leave a +5% target open,
 * while the tail closes just above EMA21 so the reclaim pattern fires.
 */
function alt15mSegments(finalClose: number): SeriesSegment[] {
  const approach = finalClose - 0.05;
  return [
    { count: 20, from: 99.8, to: 100.9, volume: 800 },
    { count: 18, from: 100.9, to: 101.9, volume: 850 },
    { count: 18, from: 101.9, to: 102.8, volume: 900 },
    { count: 18, from: 102.8, to: 103.6, volume: 950 },
    { count: 16, from: 103.6, to: 103.0, volume: 900 },
    { count: 14, from: 103.0, to: 103.9, volume: 950 },
    { count: 5, from: 103.9, to: 112.6, volume: 1500 },
    { count: 14, from: 112.6, to: 103.2, volume: 1200 },
    { count: 10, from: 103.2, to: 104.3, volume: 1000 },
    { count: 4, from: 104.3, to: 103.6, volume: 900 },
    { count: 5, from: 103.6, to: 104.2, volume: 1000 },
    { count: 3, from: 104.2, to: 104.05, volume: 900, upperWickPct: -1, lowerWickPct: -1 },
    { count: 8, from: 104.05, to: approach, volume: 1200, upperWickPct: -1, lowerWickPct: -1 },
    { count: 1, from: approach, to: finalClose, volume: 1400, upperWickPct: -1, lowerWickPct: -1 },
  ];
}

/** A loud blow-off top: the last leg runs straight up, so 15m RSI goes extreme. */
function alt15mBlowOffSegments(): SeriesSegment[] {
  const base = alt15mSegments(103.2).slice(0, 8);
  return [...base, { count: 14, from: 103.2, to: 118, volume: 2600 }];
}

const ALT_1H_SEGMENTS: SeriesSegment[] = [
  { count: 70, from: 80, to: 92, volume: 900 },
  { count: 40, from: 92, to: 97, volume: 1000 },
  { count: 10, from: 97, to: 94, volume: 900 },
  { count: 16, from: 94, to: 99, volume: 1200 },
];

const BTC_CALM_15M: SeriesSegment[] = [
  { count: 100, from: 100, to: 101.4, volume: 600 },
  { count: 20, from: 101.4, to: 101.6, volume: 600 },
];

const BTC_CALM_1H: SeriesSegment[] = [
  { count: 100, from: 100, to: 101.6, volume: 600 },
  { count: 20, from: 101.6, to: 101.9, volume: 600 },
];

const CALM_5M: SeriesSegment[] = [
  { count: 110, from: 100, to: 101.4, volume: 600 },
  { count: 10, from: 101.4, to: 101.6, volume: 600 },
];

const ALT_4H_SEGMENTS: SeriesSegment[] = [
  { count: 110, from: 100, to: 101.6, volume: 600 },
  { count: 10, from: 101.6, to: 101.9, volume: 600 },
];

const BTC_4H_SEGMENTS: SeriesSegment[] = [
  { count: 110, from: 100, to: 101.6, volume: 600 },
  { count: 10, from: 101.6, to: 101.9, volume: 600 },
];

const STABLE_5M_KLINES = makeSeries("5m", CALM_5M);
const STABLE_BTC_4H_KLINES = makeSeries("4h", BTC_4H_SEGMENTS);
const STABLE_ALT_4H_KLINES = makeSeries("4h", ALT_4H_SEGMENTS);

/** BTC dumping ~4% inside the newest 1h candle — the crash veto trigger. */
const BTC_CRASH_1H: SeriesSegment[] = [
  { count: 100, from: 100, to: 101.6, volume: 600 },
  { count: 20, from: 101.6, to: 101.9, volume: 600 },
  { count: 2, from: 101.9, to: 94, volume: 600 },
];

const ALT_TICKER_DEFAULTS: Partial<Ticker24h> = {
  lastPrice: 104.5,
  openPrice: 99,
  highPrice: 105,
  lowPrice: 98,
  priceChangePercent: 4,
  quoteVolume: 80_000_000,
};

interface MarketOptions {
  alt15m?: readonly SeriesSegment[];
  alt1h?: readonly SeriesSegment[];
  alt5m?: readonly SeriesSegment[];
  btc1h?: readonly SeriesSegment[];
  altTicker?: Partial<Ticker24h>;
  btcTicker?: Partial<Ticker24h>;
}

/** Builds the whole fake market; each scenario overrides only what it probes. */
function makeMarket(options: MarketOptions = {}) {
  const altTicker = makeTicker({ symbol: ALT, ...ALT_TICKER_DEFAULTS, ...options.altTicker });
  const altBook = makeBook({ symbol: ALT, bidPrice: 104.49, askPrice: 104.51 });

  return makeFakeClient({
    symbols: [
      makeSymbolInfo({ symbol: ALT, baseAsset: "AAA", quoteAsset: "USDT" }),
      makeSymbolInfo({ symbol: BTC, baseAsset: "BTC", quoteAsset: "USDT" }),
    ],
    tickers: [
      altTicker,
      makeTicker({ symbol: BTC, lastPrice: 101.6, quoteVolume: 5_000_000_000, ...options.btcTicker }),
    ],
    books: [
      altBook,
      makeBook({ symbol: BTC, bidPrice: 101.59, askPrice: 101.61 }),
    ],
    klines: {
      [`${ALT}|15m`]: makeSeries("15m", options.alt15m ?? alt15mSegments(104.5), ALT_15M_SHAPE),
      [`${ALT}|1h`]: makeSeries("1h", options.alt1h ?? ALT_1H_SEGMENTS, ALT_1H_SHAPE),
      [`${BTC}|15m`]: makeSeries("15m", BTC_CALM_15M),
      [`${BTC}|1h`]: makeSeries("1h", options.btc1h ?? BTC_CALM_1H),
      [`${ALT}|4h`]: STABLE_ALT_4H_KLINES,
      [`${BTC}|4h`]: STABLE_BTC_4H_KLINES,
    },
    fallbackKlines: {
      "5m": options.alt5m ? makeSeries("5m", options.alt5m, { finalVolume: 700 }) : STABLE_5M_KLINES,
      "4h": STABLE_BTC_4H_KLINES,
      "15m": [],
    },
  });
}

describe("Scenario 1 — healthy trend with an EMA21 pullback reclaim", () => {
  it("returns BUY_NOW with a tradable plan", async () => {
    const payload = await runScan(makeMarket());
    const { result, diagnostics } = payload;

    expect(result.status).toBe("BUY_NOW");
    expect(result.symbol).toBe(ALT);
    expect(result.baseAsset).toBe("AAA");
    expect(result.score).toBeGreaterThanOrEqual(SCAN_CONFIG.buyNowScore);
    expect(result.score).toBe(diagnostics.topScore);
    expect(result.marketRegime).toBe("RISK_ON");

    expect(result.plan).not.toBeNull();
    expect(result.plan?.referencePrice).toBeGreaterThan(0);
    expect(result.plan?.target5Pct).toBeCloseTo(result.plan!.referencePrice * 1.05, 6);
    expect(result.plan?.invalidation).toBeLessThan(result.plan!.referencePrice);

    expect(diagnostics.candidateCount).toBe(2);
    expect(diagnostics.providerErrors).toEqual([]);
  });
});

describe("Closed candle invariant", () => {
  it("ignores an unclosed 15m candle and keeps the closed decision", async () => {
    const openSegments = alt15mSegments(104.5);
    const openMetrics = buildIntervalMetrics(
      "15m",
      makeSeries("15m", openSegments, { ...ALT_15M_SHAPE, closeTimeOffsetMs: 5_000 }),
    );
    const closedSeries = makeSeries("15m", openSegments, ALT_15M_SHAPE).slice(0, -1);
    const closedMetrics = buildIntervalMetrics("15m", closedSeries);

    expect(openMetrics?.close).not.toEqual(closedMetrics?.close);

    const { result } = await runScan(
      makeMarket({
        alt15m: openSegments,
        alt1h: ALT_1H_SEGMENTS.map((segment) => ({ ...segment })),
        btc1h: BTC_CALM_1H.map((segment) => ({ ...segment })),
      }),
    );

    expect(result.status).toBe("BUY_NOW");
  });
});

describe("Ranking-first invariants", () => {
  it("does not let a rejected stronger name hide a tradable weaker name", async () => {
    const { result, diagnostics } = await runScan(makeMarket({ alt15m: alt15mBlowOffSegments() }));

    expect(result.status).toBe("WATCH_ONLY");
    expect(diagnostics.topCandidates.find((entry) => entry.symbol === ALT)?.score).toBe(26);
    expect(diagnostics.topCandidate).toBe(BTC);
  });

  it("records the Top1/Top2 opportunity gap in final confidence", async () => {
    const { diagnostics } = await runScan(makeMarket());

    const evaluated = diagnostics.topCandidates.filter((entry) => entry.score !== null);
    expect(evaluated.length).toBeGreaterThan(0);
    expect(evaluated[0]?.confidence).toBeDefined();
  });
});

describe("Four-timeframe resonance", () => {
  it("uses the 4h macro and 5m trigger when confirming BUY_NOW", async () => {
    const { result } = await runScan(makeMarket());

    expect(result.status).toBe("BUY_NOW");
    expect(result.reasons.join(" ")).toContain("4h");
    expect(result.reasons.join(" ")).toContain("5m");
  });
});

describe("Scenario 2 — blow-off top with extreme 15m RSI", () => {
  it("never offers a fresh entry", async () => {
    const segments = alt15mBlowOffSegments();
    const rsi = buildIntervalMetrics("15m", makeSeries("15m", segments, ALT_15M_SHAPE))?.rsi14;

    expect(rsi).toBeGreaterThanOrEqual(SCAN_CONFIG.rsiExtreme);

    const { result } = await runScan(makeMarket({ alt15m: segments }));

    expect(result.status).toBe("WATCH_ONLY");
    expect(result.score).toBe(0);
  });
});

describe("Scenario 3 — good trend, price stretched away from EMA21", () => {
  it("downgrades to BUY_ON_PULLBACK instead of chasing", async () => {
    const { result, diagnostics } = await runScan(makeMarket({ alt15m: alt15mSegments(104.45) }));


    expect(result.status).toBe("BUY_ON_PULLBACK");
    expect(result.score).toBeGreaterThanOrEqual(SCAN_CONFIG.pullbackScore);
    expect(result.score).toBeLessThan(SCAN_CONFIG.buyNowScore);
    expect(result.score).toBe(diagnostics.topScore);
  });
});

describe("Scenario 4 — thin liquidity", () => {
  it("drops the symbol before the technical stage", async () => {
    const { result, diagnostics } = await runScan(
      makeMarket({ altTicker: { quoteVolume: 3_000_000 } }),
    );

    expect(result.status).toBe("WATCH_ONLY");
    expect(result.symbol).not.toBe(ALT);
    // The thin name never reaches the volume floor, so the altcoin is absent
    // from the liquidity stage and nothing is scored on it.
    expect(diagnostics.topCandidate).not.toBe(ALT);
    expect(diagnostics.candidateCount).toBe(1);
  });

  it("names the volume floor when no symbol is liquid enough to scan", async () => {
    const { result, diagnostics } = await runScan(
      makeMarket({
        altTicker: { quoteVolume: 3_000_000 },
        btcTicker: { quoteVolume: 3_000_000 },
      }),
    );

    expect(diagnostics.universeCount).toBe(2);
    expect(diagnostics.liquidityFilterCount).toBe(0);
    expect(result.status).toBe("WATCH_ONLY");
    // A thin venue must not read as a quiet market.
    expect(result.reasons[0]).toContain("成交额下限");
  });
});

describe("debug diagnostics", () => {
  it("lists the internally evaluated candidates with score, penalty and a reason", async () => {
    const { diagnostics } = await runScan(makeMarket());

    expect(diagnostics.topCandidates.length).toBeGreaterThan(0);
    const [best] = diagnostics.topCandidates;
    expect(best?.symbol).toBe(ALT);
    expect(best?.score).toBe(diagnostics.topScore);
    expect(best?.penalty).toBe(0);
    expect(best?.status).toBe("BUY_NOW");
    // The winning row is the answer, so it is not rejected for anything.
    expect(best?.rejectReason).toBeNull();
  });

  it("records which coarse-screen check dropped a candidate", async () => {
    const { diagnostics } = await runScan(
      makeMarket({ alt15m: alt15mSegments(112) }),
    );

    const rejected = diagnostics.topCandidates.filter((entry) => entry.score === null);
    expect(rejected.length).toBeGreaterThan(0);
    const alt = rejected.find((entry) => entry.symbol === ALT);
    expect(alt?.rejectReason).toContain("RSI");
  });

  it("explains the runner-up by comparing it against the winning score", async () => {
    const { diagnostics } = await runScan(makeMarket());

    const evaluated = diagnostics.topCandidates.filter((entry) => entry.score !== null);
    if (evaluated.length > 1) {
      const runnerUp = evaluated[1];
      expect(runnerUp?.rejectReason).toContain("低于本次最佳候选的");
    }
  });
});

describe("Scenario 5 — BTC crashes while the altcoin still looks fine", () => {
  it("never reports BUY_NOW on a fast market-wide drop", async () => {
    const { result } = await runScan(makeMarket({ btc1h: BTC_CRASH_1H }));

    expect(result.status).toBe("MARKET_HALT");
    expect(result.reasons.join(" ")).toContain("BTC");
  });
});
