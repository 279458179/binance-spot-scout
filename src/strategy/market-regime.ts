/**
 * Stage 0 of the scan funnel: the BTC market regime.
 *
 * Spec #18: every altcoin score is shifted by the state of BTC. A risk-on
 * tape (1h EMA21 above EMA55 and rising) earns a small bonus, a risk-off tape
 * (EMA55 lost, RSI weak, EMA21 rolling over, or a fast 1h dump) applies a
 * penalty and blocks fresh entries via the risk gate's BTC_RAPID_DROP veto.
 *
 * Pure and synchronous: BTC klines are fetched once per scan and handed in.
 */

import { REGIME_CONFIG } from "@/config/strategy";
import type { IntervalMetrics, MarketRegime } from "@/shared/types";

/** BTC inputs required to classify the tape. */
export interface MarketRegimeInput {
  /** BTC 1h metrics; null when the series was too short or unavailable. */
  metrics1h: IntervalMetrics | null;
  /** BTC 15m metrics, used for extra context in the reasons. */
  metrics15m: IntervalMetrics | null;
  /** BTC change over the last hour in percent, when the caller has it. */
  btcDropPct1h?: number | null;
}

export interface MarketRegimeAssessment {
  regime: MarketRegime;
  /** Points added to (or subtracted from) every altcoin score. */
  points: number;
  /** Short Chinese explanations surfaced in diagnostics and the UI. */
  reasons: string[];
}

/** Score adjustment for a regime; negative for risk-off. */
export function regimePoints(regime: MarketRegime): number {
  switch (regime) {
    case "RISK_ON":
      return REGIME_CONFIG.riskOnPoints;
    case "RISK_OFF":
      return REGIME_CONFIG.riskOffPoints;
    default:
      return REGIME_CONFIG.neutralPoints;
  }
}

/**
 * Classifies the BTC tape.
 *
 * Order matters: every risk-off trigger is checked before risk-on so a tape
 * that looks bullish on EMAs but just dumped 4% is still treated as dangerous.
 * Missing BTC data falls back to NEUTRAL — the scan is not blocked, but the
 * regime bonus is never granted on guesswork.
 */
export function assessMarketRegime(input: MarketRegimeInput): MarketRegimeAssessment {
  const reasons: string[] = [];
  const metrics = input.metrics1h;

  if (!metrics) {
    reasons.push("BTC 1 小时数据缺失，按中性市场处理");
    return { regime: "NEUTRAL", points: regimePoints("NEUTRAL"), reasons };
  }

  const dropPct1h = input.btcDropPct1h ?? null;
  if (dropPct1h !== null && Number.isFinite(dropPct1h) && dropPct1h >= REGIME_CONFIG.crashPct1h) {
    reasons.push(`BTC 近 1 小时快速下跌 ${dropPct1h.toFixed(1)}%，大盘风险高`);
    return { regime: "RISK_OFF", points: regimePoints("RISK_OFF"), reasons };
  }

  if (metrics.close < metrics.ema55) {
    reasons.push("BTC 1 小时价格已跌破 EMA55，趋势转弱");
    return { regime: "RISK_OFF", points: regimePoints("RISK_OFF"), reasons };
  }

  if (metrics.rsi14 < REGIME_CONFIG.riskOffRsi) {
    reasons.push(`BTC 1 小时 RSI ${metrics.rsi14.toFixed(1)} 低于 ${REGIME_CONFIG.riskOffRsi}，动能不足`);
    return { regime: "RISK_OFF", points: regimePoints("RISK_OFF"), reasons };
  }

  if (metrics.ema21Slope < 0) {
    reasons.push("BTC 1 小时 EMA21 向下拐头，上行动能减弱");
    return { regime: "RISK_OFF", points: regimePoints("RISK_OFF"), reasons };
  }

  if (metrics.ema21 > metrics.ema55 && metrics.ema21Slope > 0) {
    reasons.push("BTC 1 小时 EMA21 位于 EMA55 上方且向上，大盘环境偏多");
    return { regime: "RISK_ON", points: regimePoints("RISK_ON"), reasons };
  }

  reasons.push("BTC 1 小时趋势不明确，按中性市场处理");
  return { regime: "NEUTRAL", points: regimePoints("NEUTRAL"), reasons };
}
