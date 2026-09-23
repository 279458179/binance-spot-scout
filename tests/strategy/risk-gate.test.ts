import { describe, expect, it } from "vitest";
import { SCAN_CONFIG } from "@/config/strategy";
import { evaluateRiskGate, RISK_VIOLATIONS } from "@/strategy/risk-gate";
import { makeMetrics } from "../fixtures/metrics";
import { makeTicker } from "../fixtures/market";

const NOW = Date.parse("2026-01-01T00:00:00.000Z");

function makeGateInput(overrides: Record<string, unknown> = {}) {
  return {
    metrics15m: makeMetrics(),
    ticker: makeTicker(),
    quoteVolume24h: 20_000_000,
    spreadPct: 0.05,
    btcDropPct1h: null,
    marketRegime: "NEUTRAL" as const,
    dataTimestamp: NOW - 60_000,
    now: NOW,
    klinesAvailable: true,
    providerErrors: [] as string[],
    ...overrides,
  };
}

describe("hard-risk-only gate", () => {
  it("does not reject RSI 76 or other strategy imperfections", () => {
    const result = evaluateRiskGate(makeGateInput({ metrics15m: makeMetrics({ rsi14: 76 }) }));
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("rejects only unusable data and severe market failures", () => {
    expect(evaluateRiskGate(makeGateInput({ klinesAvailable: false })).violations).toContain(RISK_VIOLATIONS.dataUnavailable);
    expect(evaluateRiskGate(makeGateInput({ spreadPct: 3 })).violations).toContain(RISK_VIOLATIONS.severeSpread);
    expect(evaluateRiskGate(makeGateInput({ quoteVolume24h: 4_999_999 })).violations).toContain(RISK_VIOLATIONS.severeLiquidityFailure);
  });

  it("halts a BTC flash crash at the configured drop", () => {
    const result = evaluateRiskGate(makeGateInput({ btcDropPct1h: 4 }));
    expect(result.passed).toBe(false);
    expect(result.violations).toEqual([RISK_VIOLATIONS.btcFlashCrash]);
  });

  it("accepts the configured volume floor", () => {
    expect(evaluateRiskGate(makeGateInput({ quoteVolume24h: SCAN_CONFIG.minQuoteVolume24h })).passed).toBe(true);
  });
});
