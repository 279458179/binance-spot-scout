import { describe, expect, it } from "vitest";
import { assessMarketRegime, regimePoints } from "@/strategy/market-regime";
import { makeMetrics, makeTrendMetrics } from "../fixtures/metrics";

describe("assessMarketRegime", () => {
  it("falls back to NEUTRAL when the 1h series is missing", () => {
    const result = assessMarketRegime({ metrics1h: null, metrics15m: makeMetrics() });

    expect(result.regime).toBe("NEUTRAL");
    expect(result.points).toBe(0);
    expect(result.reasons).toEqual(["BTC 1 小时数据缺失，按中性市场处理"]);
  });

  it("flags RISK_OFF on a 4% one hour dump", () => {
    const result = assessMarketRegime({
      metrics1h: makeTrendMetrics(),
      metrics15m: makeMetrics(),
      btcDropPct1h: 4,
    });

    expect(result.regime).toBe("RISK_OFF");
    expect(result.points).toBe(-5);
    expect(result.reasons).toEqual(["BTC 近 1 小时快速下跌 4.0%，大盘风险高"]);
  });

  it("does not treat 3.99% as a crash", () => {
    const result = assessMarketRegime({
      metrics1h: makeTrendMetrics({ ema21Slope: 0 }),
      metrics15m: null,
      btcDropPct1h: 3.99,
    });

    expect(result.regime).toBe("NEUTRAL");
    expect(result.reasons).not.toContain("BTC 近 1 小时快速下跌 4.0%，大盘风险高");
  });

  it("prefers the crash veto over a bullish EMA stack", () => {
    const result = assessMarketRegime({
      metrics1h: makeTrendMetrics(),
      metrics15m: makeMetrics(),
      btcDropPct1h: 9.5,
    });

    expect(result.regime).toBe("RISK_OFF");
    expect(result.reasons).toEqual(["BTC 近 1 小时快速下跌 9.5%，大盘风险高"]);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("skips the crash check for a %s drop value", (_label, btcDropPct1h) => {
    const result = assessMarketRegime({
      metrics1h: makeTrendMetrics(),
      metrics15m: null,
      btcDropPct1h,
    });

    expect(result.regime).toBe("RISK_ON");
    expect(result.reasons).toEqual(["BTC 1 小时 EMA21 位于 EMA55 上方且向上，大盘环境偏多"]);
  });

  it("flags RISK_OFF when price loses EMA55", () => {
    const result = assessMarketRegime({
      metrics1h: makeTrendMetrics({ close: 96.9, ema55: 97 }),
      metrics15m: makeMetrics(),
    });

    expect(result.regime).toBe("RISK_OFF");
    expect(result.points).toBe(-5);
    expect(result.reasons).toEqual(["BTC 1 小时价格已跌破 EMA55，趋势转弱"]);
  });

  it("does not flag RISK_OFF when price sits exactly on EMA55", () => {
    const result = assessMarketRegime({
      metrics1h: makeTrendMetrics({ close: 97, ema21: 97, ema55: 97, ema21Slope: 0 }),
      metrics15m: null,
    });

    expect(result.regime).toBe("NEUTRAL");
  });

  it("flags RISK_OFF when RSI prints 44.9", () => {
    const result = assessMarketRegime({
      metrics1h: makeTrendMetrics({ rsi14: 44.9 }),
      metrics15m: null,
    });

    expect(result.regime).toBe("RISK_OFF");
    expect(result.reasons).toEqual(["BTC 1 小时 RSI 44.9 低于 45，动能不足"]);
  });

  it("keeps RSI 45 out of the risk-off bucket", () => {
    const result = assessMarketRegime({
      metrics1h: makeTrendMetrics({ rsi14: 45, ema21Slope: 0 }),
      metrics15m: null,
    });

    expect(result.regime).toBe("NEUTRAL");
  });

  it("flags RISK_OFF when EMA21 rolls over", () => {
    const result = assessMarketRegime({
      metrics1h: makeTrendMetrics({ ema21Slope: -0.01 }),
      metrics15m: null,
    });

    expect(result.regime).toBe("RISK_OFF");
    expect(result.reasons).toEqual(["BTC 1 小时 EMA21 向下拐头，上行动能减弱"]);
  });

  it("returns RISK_ON for a stacked, rising 1h structure", () => {
    const result = assessMarketRegime({ metrics1h: makeTrendMetrics(), metrics15m: makeMetrics() });

    expect(result.regime).toBe("RISK_ON");
    expect(result.points).toBe(5);
    expect(result.reasons).toEqual(["BTC 1 小时 EMA21 位于 EMA55 上方且向上，大盘环境偏多"]);
  });

  it("returns NEUTRAL when the EMA stack is not bullish", () => {
    const result = assessMarketRegime({
      metrics1h: makeTrendMetrics({ ema21: 97, ema55: 97.5, rsi14: 60 }),
      metrics15m: null,
    });

    expect(result.regime).toBe("NEUTRAL");
    expect(result.points).toBe(0);
    expect(result.reasons).toEqual(["BTC 1 小时趋势不明确，按中性市场处理"]);
  });

  it("ignores the 15m metrics when classifying the tape", () => {
    const withContext = assessMarketRegime({
      metrics1h: makeTrendMetrics({ rsi14: 30 }),
      metrics15m: makeMetrics({ rsi14: 80 }),
    });
    const withoutContext = assessMarketRegime({ metrics1h: makeTrendMetrics({ rsi14: 30 }), metrics15m: null });

    expect(withContext).toEqual(withoutContext);
  });

  it("reports exactly one reason per branch", () => {
    const branches = [
      assessMarketRegime({ metrics1h: null, metrics15m: null }),
      assessMarketRegime({ metrics1h: makeTrendMetrics(), metrics15m: null, btcDropPct1h: 5 }),
      assessMarketRegime({ metrics1h: makeTrendMetrics(), metrics15m: null }),
    ];

    for (const branch of branches) {
      expect(branch.reasons).toHaveLength(1);
    }
  });
});

describe("regimePoints", () => {
  it("maps each regime to its configured points", () => {
    expect(regimePoints("RISK_ON")).toBe(5);
    expect(regimePoints("NEUTRAL")).toBe(0);
    expect(regimePoints("RISK_OFF")).toBe(-5);
  });
});
