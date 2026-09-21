import { describe, expect, it } from "vitest";

import { SCAN_CONFIG, THRESHOLDS } from "@/config/strategy";
import {
  RISK_VIOLATIONS,
  evaluateRiskGate,
  passesRiskGate,
  type RiskGateInput,
} from "@/strategy/risk-gate";
import { makeBook, makeTicker } from "../fixtures/market";
import { makeMetrics } from "../fixtures/metrics";

const NOW = 1_700_000_000_000;

/** Healthy input that clears every veto unless a test overrides one field. */
function makeGateInput(overrides: Partial<RiskGateInput> = {}): RiskGateInput {
  return {
    metrics15m: makeMetrics(),
    ticker: makeTicker(),
    book: makeBook(),
    quoteVolume24h: 50_000_000,
    spreadPct: 0.2,
    btcDropPct1h: 0.5,
    marketRegime: "RISK_ON",
    dataTimestamp: NOW,
    now: NOW,
    klinesAvailable: true,
    providerErrors: [],
    ...overrides,
  };
}

describe("evaluateRiskGate baseline", () => {
  it("passes a textbook-good setup with no violations and no warnings", () => {
    const result = evaluateRiskGate(makeGateInput());

    expect(result).toEqual({ passed: true, violations: [], reasons: [], warnings: [] });
    expect(passesRiskGate(makeGateInput())).toBe(true);
  });

  it("mirrors `passed` through passesRiskGate on failure too", () => {
    const input = makeGateInput({ quoteVolume24h: 1_000_000 });

    expect(passesRiskGate(input)).toBe(false);
    expect(passesRiskGate(input)).toBe(evaluateRiskGate(input).passed);
  });
});

describe("SPREAD_TOO_WIDE", () => {
  it("vetoes when neither a spread nor a book is available", () => {
    const result = evaluateRiskGate(makeGateInput({ spreadPct: null, book: null }));

    expect(result.passed).toBe(false);
    expect(result.violations).toEqual([RISK_VIOLATIONS.spreadTooWide]);
    expect(result.reasons[0]).toContain("买卖价差数据缺失");
  });

  it("vetoes a spread one tick above the cap and accepts the cap itself", () => {
    const tooWide = evaluateRiskGate(makeGateInput({ spreadPct: SCAN_CONFIG.maxSpreadPct + 0.01 }));
    const atCap = evaluateRiskGate(makeGateInput({ spreadPct: SCAN_CONFIG.maxSpreadPct }));

    expect(tooWide.violations).toEqual([RISK_VIOLATIONS.spreadTooWide]);
    expect(tooWide.reasons[0]).toContain("滑点会吞掉利润");
    expect(atCap.passed).toBe(true);
  });

  it("derives the spread from the book when spreadPct is omitted", () => {
    const tight = evaluateRiskGate(
      makeGateInput({ spreadPct: undefined, book: makeBook({ bidPrice: 100, askPrice: 100.05 }) }),
    );
    const wide = evaluateRiskGate(
      makeGateInput({ spreadPct: undefined, book: makeBook({ bidPrice: 99, askPrice: 101 }) }),
    );

    expect(tight.passed).toBe(true);
    expect(wide.violations).toEqual([RISK_VIOLATIONS.spreadTooWide]);
    expect(wide.reasons[0]).toContain("2.00%");
  });

  it("ignores a non-finite spreadPct and falls back to the book", () => {
    const result = evaluateRiskGate(
      makeGateInput({ spreadPct: Number.NaN, book: makeBook() }),
    );

    expect(result.passed).toBe(true);
  });

  it("vetoes when the derived book spread is not finite", () => {
    const result = evaluateRiskGate(
      makeGateInput({ spreadPct: undefined, book: makeBook({ bidPrice: 0, askPrice: 0 }) }),
    );

    expect(result.violations).toEqual([RISK_VIOLATIONS.spreadTooWide]);
    expect(result.reasons[0]).toContain("买卖价差数据缺失");
  });
});

describe("RSI_EXTREME_OVERBOUGHT", () => {
  it("vetoes at the extreme boundary and accepts just below it", () => {
    const atLimit = evaluateRiskGate(makeGateInput({ metrics15m: makeMetrics({ rsi14: 82 }) }));
    const below = evaluateRiskGate(makeGateInput({ metrics15m: makeMetrics({ rsi14: 81.9 }) }));

    expect(atLimit.violations).toEqual([RISK_VIOLATIONS.rsiExtremeOverbought]);
    expect(atLimit.reasons[0]).toContain("极端超买");
    expect(below.passed).toBe(true);
  });
});

describe("UPPER_WICK_TOO_LARGE", () => {
  it("vetoes only strictly above the heavy-wick ratio", () => {
    const atLimit = evaluateRiskGate(
      makeGateInput({ metrics15m: makeMetrics({ upperWickRatio: THRESHOLDS.upperWickHeavyRatio }) }),
    );
    const above = evaluateRiskGate(
      makeGateInput({
        metrics15m: makeMetrics({ upperWickRatio: THRESHOLDS.upperWickHeavyRatio + 0.01 }),
      }),
    );

    expect(atLimit.passed).toBe(true);
    expect(above.violations).toEqual([RISK_VIOLATIONS.upperWickTooLarge]);
    expect(above.reasons[0]).toContain("上方抛压明显");
  });
});

describe("TOO_FAR_FROM_EMA21", () => {
  it("vetoes beyond 2.5 ATR and accepts the boundary", () => {
    const tooFar = evaluateRiskGate(
      makeGateInput({ metrics15m: makeMetrics({ distanceFromEma21Atr: 2.51 }) }),
    );
    const atLimit = evaluateRiskGate(
      makeGateInput({ metrics15m: makeMetrics({ distanceFromEma21Atr: -2.5 }) }),
    );

    expect(tooFar.violations).toEqual([RISK_VIOLATIONS.tooFarFromEma21]);
    expect(tooFar.reasons[0]).toContain("等于追高");
    expect(atLimit.passed).toBe(true);
    expect(atLimit.warnings).toEqual(["EXTENDED_FROM_EMA21"]);
  });

  it("warns without blocking in the extended band", () => {
    const extended = evaluateRiskGate(
      makeGateInput({ metrics15m: makeMetrics({ distanceFromEma21Atr: 2.4 }) }),
    );
    const calm = evaluateRiskGate(
      makeGateInput({
        metrics15m: makeMetrics({ distanceFromEma21Atr: THRESHOLDS.distanceEma21WideAtr }),
      }),
    );

    expect(extended.passed).toBe(true);
    expect(extended.warnings).toEqual(["EXTENDED_FROM_EMA21"]);
    expect(calm.warnings).toEqual([]);
  });

  it("skips the EMA21 checks when the primary metrics are missing", () => {
    const result = evaluateRiskGate(makeGateInput({ metrics15m: null }));

    expect(result.violations).toEqual([RISK_VIOLATIONS.incompleteData]);
    expect(result.warnings).toEqual([]);
  });
});

describe("BTC_RAPID_DROP", () => {
  it("vetoes at a 4% hourly drop and accepts 3.9%", () => {
    const crash = evaluateRiskGate(makeGateInput({ btcDropPct1h: 4 }));
    const near = evaluateRiskGate(makeGateInput({ btcDropPct1h: 3.9, marketRegime: "RISK_OFF" }));

    expect(crash.violations).toEqual([RISK_VIOLATIONS.btcRapidDrop]);
    expect(crash.reasons[0]).toContain("不接飞刀");
    expect(near.passed).toBe(true);
    expect(near.warnings).toEqual(["BTC_RISK_OFF"]);
  });

  it("warns on a risk-off tape when BTC has not dumped hard yet", () => {
    const result = evaluateRiskGate(
      makeGateInput({ btcDropPct1h: null, marketRegime: "RISK_OFF" }),
    );

    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual(["BTC_RISK_OFF"]);
  });

  it("does not warn when the tape is risk-on or neutral", () => {
    expect(evaluateRiskGate(makeGateInput({ marketRegime: "RISK_ON" })).warnings).toEqual([]);
    expect(evaluateRiskGate(makeGateInput({ marketRegime: "NEUTRAL" })).warnings).toEqual([]);
  });
});

describe("RALLY_24H_EXTREME", () => {
  it("vetoes only strictly above the 24h rally cap", () => {
    const atLimit = evaluateRiskGate(
      makeGateInput({ ticker: makeTicker({ priceChangePercent: THRESHOLDS.rally24hRejectPct }) }),
    );
    const above = evaluateRiskGate(
      makeGateInput({ ticker: makeTicker({ priceChangePercent: 35.1 }) }),
    );

    expect(atLimit.passed).toBe(true);
    expect(above.violations).toEqual([RISK_VIOLATIONS.rally24hExtreme]);
    expect(above.reasons[0]).toContain("风险收益比很差");
  });
});

describe("INSUFFICIENT_LIQUIDITY", () => {
  it("vetoes below the 5M floor and accepts the floor itself", () => {
    const below = evaluateRiskGate(makeGateInput({ quoteVolume24h: 4_999_999 }));
    const atFloor = evaluateRiskGate(makeGateInput({ quoteVolume24h: SCAN_CONFIG.minQuoteVolume24h }));

    expect(below.violations).toEqual([RISK_VIOLATIONS.insufficientLiquidity]);
    expect(below.reasons[0]).toContain("流动性下限");
    expect(atFloor.passed).toBe(true);
    expect(atFloor.warnings).toEqual(["THIN_LIQUIDITY"]);
  });

  it("warns in the thin band and stays quiet at 1.5x the floor", () => {
    const thin = evaluateRiskGate(makeGateInput({ quoteVolume24h: 7_400_000 }));
    const fine = evaluateRiskGate(makeGateInput({ quoteVolume24h: 7_500_000 }));

    expect(thin.passed).toBe(true);
    expect(thin.warnings).toEqual(["THIN_LIQUIDITY"]);
    expect(fine.warnings).toEqual([]);
  });

  it("vetoes a non-finite volume", () => {
    const result = evaluateRiskGate(makeGateInput({ quoteVolume24h: Number.NaN }));

    expect(result.violations).toEqual([RISK_VIOLATIONS.insufficientLiquidity]);
  });
});

describe("DATA_STALE", () => {
  it("accepts exactly 5 minutes of age and vetoes one millisecond more", () => {
    const atLimit = evaluateRiskGate(
      makeGateInput({ dataTimestamp: NOW - SCAN_CONFIG.dataFreshnessMs }),
    );
    const stale = evaluateRiskGate(
      makeGateInput({ dataTimestamp: NOW - SCAN_CONFIG.dataFreshnessMs - 1 }),
    );

    expect(atLimit.passed).toBe(true);
    expect(atLimit.warnings).toEqual([]);
    expect(stale.violations).toEqual([RISK_VIOLATIONS.dataStale]);
    expect(stale.warnings).toEqual(["DATA_STALE"]);
    expect(stale.reasons[0]).toContain("数据已过期");
  });

  it("vetoes a non-finite timestamp", () => {
    const result = evaluateRiskGate(makeGateInput({ dataTimestamp: Number.NaN }));

    expect(result.violations).toEqual([RISK_VIOLATIONS.dataStale]);
    expect(result.warnings).toEqual(["DATA_STALE"]);
  });
});

describe("INCOMPLETE_DATA", () => {
  it("vetoes when klines were unavailable", () => {
    const result = evaluateRiskGate(makeGateInput({ klinesAvailable: false }));

    expect(result.violations).toEqual([RISK_VIOLATIONS.incompleteData]);
    expect(result.reasons[0]).toContain("数据不完整");
  });

  it("vetoes when the ticker is missing", () => {
    expect(evaluateRiskGate(makeGateInput({ ticker: null })).violations).toEqual([
      RISK_VIOLATIONS.incompleteData,
    ]);
  });

  it("lists every provider error in the reason", () => {
    const result = evaluateRiskGate(
      makeGateInput({ providerErrors: ["ticker 超时", "klines 429"] }),
    );

    expect(result.violations).toEqual([RISK_VIOLATIONS.incompleteData]);
    expect(result.reasons[0]).toContain("（ticker 超时；klines 429）");
  });
});

describe("violation accumulation", () => {
  it("collects every veto instead of stopping at the first one", () => {
    const result = evaluateRiskGate(
      makeGateInput({
        metrics15m: makeMetrics({ rsi14: 90, upperWickRatio: 0.8, distanceFromEma21Atr: 4 }),
        ticker: makeTicker({ priceChangePercent: 60 }),
        quoteVolume24h: 1_000_000,
        spreadPct: 1.5,
        btcDropPct1h: 7,
        dataTimestamp: NOW - 10 * 60_000,
        klinesAvailable: false,
        providerErrors: ["book 失败"],
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.violations).toEqual([
      RISK_VIOLATIONS.spreadTooWide,
      RISK_VIOLATIONS.rsiExtremeOverbought,
      RISK_VIOLATIONS.upperWickTooLarge,
      RISK_VIOLATIONS.tooFarFromEma21,
      RISK_VIOLATIONS.btcRapidDrop,
      RISK_VIOLATIONS.rally24hExtreme,
      RISK_VIOLATIONS.insufficientLiquidity,
      RISK_VIOLATIONS.dataStale,
      RISK_VIOLATIONS.incompleteData,
    ]);
    expect(result.reasons).toHaveLength(9);
    expect(new Set(result.warnings).size).toBe(result.warnings.length);
  });

  it("keeps one warning per code even when several branches fire", () => {
    const result = evaluateRiskGate(
      makeGateInput({
        quoteVolume24h: 6_000_000,
        marketRegime: "RISK_OFF",
        dataTimestamp: NOW - 20 * 60_000,
      }),
    );

    expect(result.warnings).toEqual(["BTC_RISK_OFF", "THIN_LIQUIDITY", "DATA_STALE"]);
  });
});
