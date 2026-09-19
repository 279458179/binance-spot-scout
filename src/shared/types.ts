/**
 * Shared domain types for Spot Scout.
 *
 * These types are used by the Worker (data layer + strategy) and by the React
 * client. They describe only public Binance Spot market data — no API keys,
 * no account state, no order placement.
 */

/** Decision produced by the strategy for a single scan. */
export type ScanStatus = "ENTRY_NOW" | "WAIT_PULLBACK" | "NO_TRADE";

/** Coarse BTC market environment used to dampen altcoin risk. */
export type MarketRegime = "RISK_ON" | "NEUTRAL" | "RISK_OFF";

export const SCAN_STATUSES: readonly ScanStatus[] = [
  "ENTRY_NOW",
  "WAIT_PULLBACK",
  "NO_TRADE",
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
  /** Open time, epoch milliseconds. */
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Base asset volume. */
  volume: number;
  /** Close time, epoch milliseconds. */
  closeTime: number;
  /** Quote asset volume. */
  quoteVolume: number;
  /** Number of trades. */
  trades: number;
  /** Taker buy base asset volume. */
  takerBuyBase: number;
  /** Taker buy quote asset volume. */
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
  /** Distance from close to EMA21 expressed in ATR units. */
  distanceFromEma21Atr: number;
  /** Higher-high / higher-low structure over the lookback window. */
  higherHigh: boolean;
  higherLow: boolean;
}

/** Detected entry structures, in descending order of preference. */
export type PatternKind = "A_EMA21_PULLBACK_RECLAIM" | "B_BREAKOUT_HOLD" | "C_TREND_CONTINUATION" | "NONE";

export interface PatternDetection {
  kind: PatternKind;
  /** Human-readable Chinese explanation used in `reasons` / `risks`. */
  label: string;
  matched: boolean;
}

/** Nearest support / resistance levels derived from swing structure. */
export interface SupportResistance {
  support: number;
  resistance: number;
  /** (resistance - price) / price * 100 */
  distanceToResistancePct: number;
  /** (price - support) / price * 100 */
  distanceToSupportPct: number;
  /** True when +targetPct% would run into the nearest resistance too early. */
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
  /** Positive number representing points removed. */
  penalty: number;
  total: number;
}

/** Risk gate verdict — evaluated independently of, and with priority over, the score. */
export interface RiskGateResult {
  passed: boolean;
  /** Machine-readable rule ids that blocked a fresh entry. */
  violations: string[];
  /** Chinese operator-facing explanations for each violation. */
  reasons: string[];
  /** Non-blocking advisories shown as `risks`. */
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
  target5Pct: number;
  invalidation: number;
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
}

/** Payload wrapper returned by `POST /api/scan` and `GET /api/latest`. */
export interface ScanPayload {
  result: ScanResult;
  diagnostics: ScanDiagnostics;
  /** True when served from KV cache rather than a fresh scan. */
  cached: boolean;
}

/** A row of `GET /api/history`. */
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
  /** Present when the failure is an upstream market-data problem. */
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
