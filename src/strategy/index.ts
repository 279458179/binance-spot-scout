/**
 * Public surface of the strategy layer.
 *
 * Consumers (worker, backtest, tests) should import from `@/strategy` rather
 * than reaching into individual modules, so the funnel order stays an
 * implementation detail of this package.
 */

export { buildLiquidityCandidates, isSpreadTradable, judgeSpread, liquidityPoints, passesVolumeFloor, selectTechnicalScanSet } from "@/strategy/liquidity";
export { assessMarketRegime, regimePoints } from "@/strategy/market-regime";
export { bestPattern, detectPatterns } from "@/strategy/patterns";
export { evaluateRiskGate, passesRiskGate, RISK_VIOLATIONS } from "@/strategy/risk-gate";
export { runScan } from "@/strategy/scanner";
export { MAX_POSITIVE_SCORE, scoreCandidate } from "@/strategy/scoring";
export { detectSupportResistance } from "@/strategy/support-resistance";
export { buildUniverse, classifySymbols, universeSymbols } from "@/strategy/universe";

export type { LiquidityCandidate, SpreadVerdict } from "@/strategy/liquidity";
export type { MarketRegimeAssessment, MarketRegimeInput } from "@/strategy/market-regime";
export type { RiskGateInput, RiskViolation } from "@/strategy/risk-gate";
export type { ScoreInput } from "@/strategy/scoring";
export type { UniverseDecision, UniverseRejection } from "@/strategy/universe";
