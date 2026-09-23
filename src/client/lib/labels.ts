/**
 * Chinese copy for every machine-readable enum the API can return.
 *
 * The wording is deliberate: the score is a *综合评分*, never a probability of
 * going up, and a passed scan is a candidate to watch — not a buy instruction.
 */

import type { MarketRegime, PatternKind, ScanStatus } from "@/shared/types";

export const STATUS_LABELS: Record<ScanStatus, string> = {
  BUY_NOW: "当前最佳候选",
  BUY_ON_PULLBACK: "等回踩再动",
  WATCH_ONLY: "仅观察",
  MARKET_HALT: "市场停扫",
};

export const STATUS_TAGLINES: Record<ScanStatus, string> = {
  BUY_NOW: "结构、位置与短周期触发同时满足。",
  BUY_ON_PULLBACK: "候选成立，但更适合等价格回到计划区。",
  WATCH_ONLY: "市场偏弱，先观察相对最优候选。",
  MARKET_HALT: "市场数据或系统性风险触发停扫。",
};

export const REGIME_LABELS: Record<MarketRegime, string> = {
  RISK_ON: "风险偏好回升",
  NEUTRAL: "中性震荡",
  RISK_OFF: "风险规避",
};

export const REGIME_HINTS: Record<MarketRegime, string> = {
  RISK_ON: "BTC 结构偏强，山寨的容错率更高一点。",
  NEUTRAL: "BTC 没有明确方向，只做最干净的形态。",
  RISK_OFF: "BTC 走弱，评分再高也会被风险闸门压住。",
};

export const PATTERN_LABELS: Record<PatternKind, string> = {
  A_EMA21_PULLBACK_RECLAIM: "回踩 EMA21 后收回",
  B_BREAKOUT_HOLD: "突破后站稳",
  C_TREND_CONTINUATION: "趋势延续",
  NONE: "暂无可识别结构",
};

/** Score buckets, in the order the strategy computes them. */
export const SCORE_ITEMS = [
  { key: "trend", label: "趋势结构", max: 25 },
  { key: "momentum", label: "动能", max: 20 },
  { key: "volume", label: "量能", max: 15 },
  { key: "entry", label: "入场位置", max: 15 },
  { key: "liquidity", label: "流动性", max: 10 },
  { key: "riskReward", label: "盈亏比", max: 10 },
  { key: "market", label: "市场环境", max: 5 },
] as const;

export type ScoreItemKey = (typeof SCORE_ITEMS)[number]["key"];

/** Funnel stage ids emitted by the scan orchestrator. */
export const FUNNEL_LABELS: Record<string, string> = {
  universe: "USDT 现货合约对",
  liquidity: "24h 成交额过滤后",
  technical: "技术面初筛后",
  deep: "深度扫描",
  candidate: "候选",
};

export function funnelLabel(stage: string): string {
  return FUNNEL_LABELS[stage] ?? stage;
}
