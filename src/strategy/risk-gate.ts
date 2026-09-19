/**
 * Stage 4 of the scan funnel: the hard safety gate.
 *
 * The gate never looks at the score. Spec rule #22: any single veto below
 * blocks a fresh ENTRY_NOW, no matter how attractive the setup looks, and
 * `Risk Gate > Score` (#22) is enforced by `scanner.ts` separately.
 *
 * Pure and synchronous so every rule can be unit-tested from a fixture.
 */

import {
  REGIME_CONFIG,
  SCAN_CONFIG,
  THRESHOLDS,
  WARNING_CODES,
} from "@/config/strategy";
import { spreadPct as bookSpreadPct } from "@/lib/binance/parse";
import type {
  BookTicker,
  IntervalMetrics,
  MarketRegime,
  RiskGateResult,
  Ticker24h,
} from "@/shared/types";

/** Machine-readable ids for the nine vetoes of spec #22. */
export const RISK_VIOLATIONS = {
  spreadTooWide: "SPREAD_TOO_WIDE",
  rsiExtremeOverbought: "RSI_EXTREME_OVERBOUGHT",
  btcRapidDrop: "BTC_RAPID_DROP",
  upperWickTooLarge: "UPPER_WICK_TOO_LARGE",
  tooFarFromEma21: "TOO_FAR_FROM_EMA21",
  rally24hExtreme: "RALLY_24H_EXTREME",
  insufficientLiquidity: "INSUFFICIENT_LIQUIDITY",
  dataStale: "DATA_STALE",
  incompleteData: "INCOMPLETE_DATA",
} as const;

export type RiskViolation = (typeof RISK_VIOLATIONS)[keyof typeof RISK_VIOLATIONS];

/** Everything the gate needs; nullable on purpose so gaps become vetoes instead of crashes. */
export interface RiskGateInput {
  /** Primary 15m snapshot; null when the series was too short to compute. */
  metrics15m: IntervalMetrics | null;
  /** 24h ticker for the symbol; null when it was missing from the batch. */
  ticker: Ticker24h | null;
  /** Best bid/ask snapshot, used to derive the spread when not supplied. */
  book: BookTicker | null;
  /** 24h quote volume in USDT used by the liquidity floor. */
  quoteVolume24h: number;
  /** Pre-computed spread; falls back to `book` when omitted. */
  spreadPct?: number | null;
  /** BTC 1h change in percent, injected so the gate stays network-free. */
  btcDropPct1h?: number | null;
  /** BTC regime from `market-regime.ts`, surfaced as a non-blocking warning. */
  marketRegime?: MarketRegime | null;
  /** Timestamp of the freshest input data. */
  dataTimestamp: number;
  /** Wall-clock time of this evaluation. */
  now: number;
  /** False when the required klines could not be fetched. */
  klinesAvailable: boolean;
  /** Provider failures collected during the scan. */
  providerErrors?: readonly string[];
}

/** Volume below this multiple of the floor is tradable but worth flagging. */
const THIN_LIQUIDITY_FLOOR_MULTIPLE = 1.5;

function evaluateSpread(input: RiskGateInput): number | null {
  if (typeof input.spreadPct === "number" && Number.isFinite(input.spreadPct)) {
    return input.spreadPct;
  }
  if (input.book) {
    const derived = bookSpreadPct(input.book);
    return Number.isFinite(derived) ? derived : null;
  }
  return null;
}

/**
 * Applies all nine vetoes, collecting every violation instead of stopping at
 * the first one so the UI can explain the full picture.
 */
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

  const spread = evaluateSpread(input);
  if (spread === null || !Number.isFinite(spread) || spread > SCAN_CONFIG.maxSpreadPct) {
    block(
      RISK_VIOLATIONS.spreadTooWide,
      spread === null
        ? "买卖价差数据缺失，无法确认可以按合理价格成交"
        : `买卖价差 ${spread.toFixed(2)}% 超过 ${SCAN_CONFIG.maxSpreadPct}% 上限，滑点会吞掉利润`,
    );
  }

  const metrics = input.metrics15m;
  if (metrics) {
    if (metrics.rsi14 >= SCAN_CONFIG.rsiExtreme) {
      block(
        RISK_VIOLATIONS.rsiExtremeOverbought,
        `15m RSI ${metrics.rsi14.toFixed(1)} 已达极端超买（上限 ${SCAN_CONFIG.rsiExtreme}），追高接盘风险大`,
      );
    }

    if (metrics.upperWickRatio > THRESHOLDS.upperWickHeavyRatio) {
      block(
        RISK_VIOLATIONS.upperWickTooLarge,
        `上影线占比 ${(metrics.upperWickRatio * 100).toFixed(0)}% 偏大，上方抛压明显`,
      );
    }

    const distance = Math.abs(metrics.distanceFromEma21Atr);
    if (distance > SCAN_CONFIG.maxDistanceFromEma21Atr) {
      block(
        RISK_VIOLATIONS.tooFarFromEma21,
        `价格偏离 EMA21 达 ${distance.toFixed(1)} ATR（上限 ${SCAN_CONFIG.maxDistanceFromEma21Atr}），现在进场等于追高`,
      );
    } else if (distance > THRESHOLDS.distanceEma21WideAtr) {
      warn(WARNING_CODES.extended);
    }
  }

  const btcDropPct1h = input.btcDropPct1h ?? null;
  if (btcDropPct1h !== null && btcDropPct1h >= REGIME_CONFIG.crashPct1h) {
    block(
      RISK_VIOLATIONS.btcRapidDrop,
      `BTC 近 1 小时下跌 ${btcDropPct1h.toFixed(1)}%，大盘快速走弱时不接飞刀`,
    );
  } else if (input.marketRegime === "RISK_OFF") {
    warn(WARNING_CODES.btcRiskOff);
  }

  const changePercent = input.ticker?.priceChangePercent ?? null;
  if (changePercent !== null && changePercent > THRESHOLDS.rally24hRejectPct) {
    block(
      RISK_VIOLATIONS.rally24hExtreme,
      `24h 已上涨 ${changePercent.toFixed(1)}%，极端拉升后追入的风险收益比很差`,
    );
  }

  if (!Number.isFinite(input.quoteVolume24h) || input.quoteVolume24h < SCAN_CONFIG.minQuoteVolume24h) {
    block(
      RISK_VIOLATIONS.insufficientLiquidity,
      `24h 成交额 ${(input.quoteVolume24h / 1_000_000).toFixed(1)}M USDT 低于 ${SCAN_CONFIG.minQuoteVolume24h / 1_000_000}M 流动性下限`,
    );
  } else if (input.quoteVolume24h < SCAN_CONFIG.minQuoteVolume24h * THIN_LIQUIDITY_FLOOR_MULTIPLE) {
    warn(WARNING_CODES.thinLiquidity);
  }

  const ageMs = input.now - input.dataTimestamp;
  if (!Number.isFinite(ageMs) || ageMs > SCAN_CONFIG.dataFreshnessMs) {
    block(
      RISK_VIOLATIONS.dataStale,
      `数据已过期（超过 ${Math.round(SCAN_CONFIG.dataFreshnessMs / 60_000)} 分钟），无法给出及时建议`,
    );
    warn(WARNING_CODES.dataStale);
  }

  const providerErrors = input.providerErrors ?? [];
  if (!metrics || !input.ticker || !input.klinesAvailable || providerErrors.length > 0) {
    const detail = providerErrors.length > 0 ? `（${providerErrors.join("；")}）` : "";
    block(
      RISK_VIOLATIONS.incompleteData,
      `Binance 数据不完整，无法完成风险评估${detail}`,
    );
  }

  return { passed: violations.length === 0, violations, reasons, warnings };
}
