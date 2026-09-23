/**
 * Hard-risk gate for v1.1.
 *
 * Only systemic data, trading-state, extreme spread/liquidity and BTC crash
 * failures may remove a candidate. Strategy imperfections are handled by the
 * opportunity scorer and decision model, never by clearing the universe.
 */

import { REGIME_CONFIG, SCAN_CONFIG, WARNING_CODES } from "@/config/strategy";
import type {
  IntervalMetrics,
  MarketRegime,
  RiskGateResult,
  Ticker24h,
} from "@/shared/types";

export const RISK_VIOLATIONS = {
  dataUnavailable: "DATA_UNAVAILABLE",
  dataStale: "DATA_STALE",
  symbolNotTrading: "SYMBOL_NOT_TRADING",
  severeSpread: "SEVERE_SPREAD",
  severeLiquidityFailure: "SEVERE_LIQUIDITY_FAILURE",
  btcFlashCrash: "BTC_FLASH_CRASH",
  brokenKline: "BROKEN_KLINE",
} as const;

export type RiskViolation = (typeof RISK_VIOLATIONS)[keyof typeof RISK_VIOLATIONS];

export interface RiskGateInput {
  metrics15m: IntervalMetrics | null;
  ticker: Ticker24h | null;
  quoteVolume24h: number;
  spreadPct?: number | null;
  btcDropPct1h?: number | null;
  marketRegime?: MarketRegime | null;
  dataTimestamp: number;
  now: number;
  klinesAvailable: boolean;
  providerErrors?: readonly string[];
}

/** Anything beyond this is no longer a normal market and cannot be ranked. */
const SEVERE_SPREAD_PCT = 3;

export function passesRiskGate(input: RiskGateInput): boolean {
  return evaluateRiskGate(input).passed;
}

export function evaluateRiskGate(input: RiskGateInput): RiskGateResult {
  const violations: RiskViolation[] = [];
  const reasons: string[] = [];
  const warnings: string[] = [];

  const block = (id: RiskViolation, reason: string): void => {
    violations.push(id);
    reasons.push(reason);
  };
  const warn = (code: string): void => {
    if (!warnings.includes(code)) warnings.push(code);
  };

  if (!input.metrics15m || !Number.isFinite(input.metrics15m.close)) {
    block(RISK_VIOLATIONS.brokenKline, "K 线指标无效，无法评估候选");
  }

  if (!input.ticker || !input.klinesAvailable) {
    block(RISK_VIOLATIONS.dataUnavailable, "行情数据不完整，无法形成候选");
  }

  const spread = input.spreadPct;
  if (typeof spread !== "number" || !Number.isFinite(spread) || spread >= SEVERE_SPREAD_PCT) {
    block(RISK_VIOLATIONS.severeSpread, "买卖价差异常，不能给出可执行候选");
  }

  if (!Number.isFinite(input.quoteVolume24h) || input.quoteVolume24h < SCAN_CONFIG.minQuoteVolume24h) {
    block(
      RISK_VIOLATIONS.severeLiquidityFailure,
      `24h 成交额 ${(input.quoteVolume24h / 1_000_000).toFixed(1)}M USDT 低于流动性硬下限`,
    );
  } else if (input.quoteVolume24h < SCAN_CONFIG.minQuoteVolume24h * 1.5) {
    warn(WARNING_CODES.thinLiquidity);
  }

  const btcDropPct1h = input.btcDropPct1h;
  if (btcDropPct1h !== null && btcDropPct1h !== undefined && btcDropPct1h >= REGIME_CONFIG.crashPct1h) {
    block(
      RISK_VIOLATIONS.btcFlashCrash,
      `BTC 近 1 小时下跌 ${btcDropPct1h.toFixed(1)}%，触发系统性停扫`,
    );
  } else if (input.marketRegime === "RISK_OFF") {
    warn(WARNING_CODES.btcRiskOff);
  }

  const ageMs = input.now - input.dataTimestamp;
  if (!Number.isFinite(ageMs) || ageMs > SCAN_CONFIG.dataFreshnessMs) {
    block(RISK_VIOLATIONS.dataStale, "行情数据过期，不能形成候选");
    warn(WARNING_CODES.dataStale);
  }

  const providerErrors = input.providerErrors ?? [];
  if (providerErrors.length > 0) {
    block(RISK_VIOLATIONS.dataUnavailable, `行情获取失败（${providerErrors.join("；")}）`);
  }

  return { passed: violations.length === 0, violations, reasons, warnings };
}
