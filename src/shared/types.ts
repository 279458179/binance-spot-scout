/**
 * Shared domain types for Spot Scout.
 *
 * These types are used by the Worker (data layer + strategy) and by the React
 * client. They describe only public Binance Spot market data — no API keys,
 * no account state, no order placement.
 */

/** Decision produced by the strategy for a single scan. */
export type ScanStatus = "BUY_NOW" | "BUY_ON_PULLBACK" | "WATCH_ONLY" | "MARKET_HALT";

/** Coarse BTC market environment used to dampen altcoin risk. */
export type MarketRegime = "RISK_ON" | "NEUTRAL" | "RISK_OFF";

export const SCAN_STATUSES: readonly ScanStatus[] = [
  "BUY_NOW",
  "BUY_ON_PULLBACK",
  "WATCH_ONLY",
  "MARKET_HALT",
] as const;

export const MARKET_REGIMES: readonly MarketRegime[] = [
  "RISK_ON",
  "NEUTRAL",
  "RISK_OFF",
] as const;

/** Candlestick interval identifiers supported by the scanner. */
export type Interval = "5m" | "15m" | "1h" | "4h";

/** A kline as returned by Binance, parsed into typed numbers. */
export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
  takerBuyBase: number;
  takerBuyQuote: number;
}

/** 24h rolling ticker statistics for one symbol. */
export interface Ticker24h {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  quoteVolume: number;
  volume: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  count: number;
}

/** Best bid/ask snapshot for one symbol. */
export interface BookTicker {
  symbol: string;
  bidPrice: number;
  bidQty: number;
  askPrice: number;
  askQty: number;
}

/** Raw frame of the `bookTicker` websocket stream. */
export interface TickerPayload {
  u: number;
  s: string;
  b: string;
  B: string;
  a: string;
  A: string;
}

/** Normalized live quote for the symbol under watch. */
export interface TickerSnapshot {
  price: number;
  updatedAt: number;
  connected: boolean;
  error: string | null;
}

/** A tradable USDT spot symbol after universe filtering. */
export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
}

/** Indicator snapshot for a single interval. */
export interface IntervalMetrics {
  interval: Interval;
  close: number;
  ema9: number;
  ema21: number;
  ema55: number;
  ema21Slope: number;
  ema55Slope: number;
  rsi14: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  macdHistogramPrev: number;
  atr14: number;
  atrPct: number;
  volumeSma20: number;
  volumeRatio: number;
  vwap: number;
  high20: number;
  low20: number;
  upperWickRatio: number;
  lowerWickRatio: number;
  distanceFromEma21Atr: number;
  higherHigh: boolean;
  higherLow: boolean;
}

/** Detected entry structures, in descending order of preference. */
export type PatternKind = "A_EMA21_PULLBACK_RECLAIM" | "B_BREAKOUT_HOLD" | "C_TREND_CONTINUATION" | "NONE";

export interface PatternDetection {
  kind: PatternKind;
  label: string;
  matched: boolean;
}

/** Nearest support / resistance levels derived from swing structure. */
export interface SupportResistance {
  support: number;
  resistance: number;
  distanceToResistancePct: number;
  distanceToSupportPct: number;
  targetBlocked: boolean;
  method: string;
}

/** Score breakdown. Sum of positive parts maxes at 100; penalty is subtracted. */
export interface ScoreBreakdown {
  trend: number;
  momentum: number;
  volume: number;
  entry: number;
  liquidity: number;
  riskReward: number;
  market: number;
  penalty: number;
  total: number;
}

/** Hard-risk gate verdict; soft risks are represented by warnings. */
export interface RiskGateResult {
  passed: boolean;
  violations: string[];
  reasons: string[];
  warnings: string[];
}

/** Full metrics block returned by the API. */
export interface CandidateMetrics {
  rsi15m: number;
  rsi1h: number;
  volumeRatio: number;
  spreadPct: number;
  atrPct: number;
}

/** Concrete price plan attached to a decision. */
export interface TradePlan {
  referencePrice: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  pullbackPrice: number;
  target3Pct: number;
  target5Pct: number;
  invalidation: number;
  riskReward: number;
}

/** One scan result, as stored in KV and returned by the API. */
export interface ScanResult {
  status: ScanStatus;
  symbol: string | null;
  baseAsset: string | null;
  price: number | null;
  score: number;
  targetPct: number;
  marketRegime: MarketRegime;
  reasons: string[];
  risks: string[];
  metrics: CandidateMetrics | null;
  plan: TradePlan | null;
  generatedAt: string;
  strategyVersion: string;
  absoluteScore?: number;
  opportunityScore?: number;
  marketRank?: number;
  relativeRank?: number;
  confidence?: Confidence;
  topCandidates?: TopCandidateSummary[];
  recentPrices?: number[];
}

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export const CONFIDENCE_LEVELS: readonly Confidence[] = ["HIGH", "MEDIUM", "LOW"] as const;

/** Compact ranking row persisted for diagnostics and final-selection tests. */
export interface TopCandidateSummary {
  symbol: string;
  status: ScanStatus;
  absoluteScore: number;
  opportunityScore: number;
  hardRiskPassed: boolean;
  triggerConfirmed: boolean;
}

/** Diagnostics describing how the funnel shrank, for `/debug` and the API. */
export interface ScanDiagnostics {
  universeCount: number;
  liquidityFilterCount: number;
  technicalScanCount: number;
  deepScanCount: number;
  candidateCount: number;
  topCandidate: string | null;
  topScore: number | null;
  scanDurationMs: number;
  dataTimestamp: number;
  providerErrors: string[];
  topCandidates: DebugCandidate[];
}

/** One internally-evaluated candidate, kept for the debug view. */
export interface DebugCandidate {
  symbol: string;
  quoteVolume24h: number;
  score: number | null;
  penalty: number | null;
  confidence: Confidence;
  status: ScanStatus | null;
  reasons: string[];
  rejectReason: string | null;
}

/** Payload wrapper returned by `POST /api/scan` and `GET /api/latest`. */
export interface ScanPayload {
  result: ScanResult;
  diagnostics: ScanDiagnostics;
  cached: boolean;
}

/** One row of `GET /api/history`. */
export interface HistoryEntry {
  id: number;
  createdAt: string;
  symbol: string | null;
  price: number | null;
  score: number;
  status: ScanStatus;
  marketRegime: MarketRegime;
  targetPrice: number | null;
  invalidationPrice: number | null;
  reasons: string[];
  risks: string[];
  outcome?: HistoryOutcome;
}

/** Actual performance recorded for a historical decision, when available. */
export interface HistoryOutcome {
  price1h: number | null;
  price6h: number | null;
  price24h: number | null;
  mfePct: number | null;
  maePct: number | null;
  target3Hit: boolean | null;
  target5Hit: boolean | null;
}

/** One decision-window research aggregate. */
export interface ResearchWindowStats {
  status: ScanStatus;
  sampleSize: number;
  hit3Pct: number | null;
  hit5Pct: number | null;
  medianMfePct: number | null;
  medianMaePct: number | null;
  medianReturn24hPct: number | null;
  averageReturn1hPct: number | null;
  averageReturn6hPct: number | null;
}

/** A 7d / 30d research report for the Research page. */
export interface ResearchReport {
  days: 7 | 30;
  windows: ResearchWindowStats[];
}

/** Health endpoint payload. */
export interface HealthPayload {
  ok: boolean;
  strategyVersion?: string;
  time?: string;
}

/** Error envelope. Never contains secrets. */
export interface ApiError {
  ok: false;
  error: string;
  message: string;
  code?: "DATA_UNAVAILABLE" | "INVALID_REQUEST" | "INTERNAL";
}

/** Public configuration surfaced to the UI (never contains secrets). */
export interface PublicConfig {
  strategyVersion: string;
  debug: boolean;
}

/** One node of the scan funnel, used by the debug page. */
export interface FunnelStage {
  stage: string;
  count: number;
}

/** Detail payload for `GET /api/symbol/:symbol`. */
export interface SymbolDetail {
  symbol: string;
  generatedAt: string;
  marketRegime: MarketRegime;
  metrics15m: IntervalMetrics | null;
  metrics1h: IntervalMetrics | null;
  metrics5m: IntervalMetrics | null;
  metrics4h: IntervalMetrics | null;
  ticker: Ticker24h | null;
  book: BookTicker | null;
  supportResistance: SupportResistance | null;
  score: ScoreBreakdown | null;
  riskGate: RiskGateResult | null;
  patterns: PatternDetection[];
  notes: string[];
}
