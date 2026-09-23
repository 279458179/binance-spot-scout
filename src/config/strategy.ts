/**
 * Single source of truth for the Spot Scout strategy.
 *
 * Every number the scanner, the scorer and the risk gate rely on lives here so
 * that behaviour is auditable and so that the UI can explain the rules without
 * hard-coding them twice (see `publicConfig()`).
 */

/** Intervals used by the funnel. */
export const INTERVALS = {
  /** Fast confirmation interval, applied to the shortlisted names. */
  confirmation: "5m",
  /** Primary decision interval. */
  primary: "15m",
  /** Trend context interval. */
  trend: "1h",
  /** Higher-timeframe context interval. */
  macro: "4h",
} as const;

export const STRATEGY_VERSION = "1.3.0";

export const SCAN_CONFIG = {
  /** Take-profit target used for every trade plan. */
  targetPct: 5,
  /** Minimum 24h quote volume for a symbol to be considered liquid. */
  minQuoteVolume24h: 5_000_000,
  /** Spread at or below this is considered ideal (full liquidity points). */
  preferredSpreadPct: 0.3,
  /** Spread above this rejects the symbol outright. */
  maxSpreadPct: 0.6,
  /** Ideal RSI window for a fresh entry. */
  rsiIdealMin: 52,
  rsiIdealMax: 68,
  /** RSI above this is overbought and starts to cost points. */
  rsiOverbought: 75,
  /** Hard ceiling: above this the risk gate blocks a fresh entry. */
  rsiExtreme: 82,
  /** Distance from EMA21 (in ATR) beyond which we stop chasing. */
  maxDistanceFromEma21Atr: 2.5,
  /** Opportunity score required for BUY_NOW. */
  buyNowScore: 79,
  /** Opportunity score required for BUY_ON_PULLBACK. */
  pullbackScore: 65,
  /** Symbols that survive liquidity filtering and reach the 15m/1h scan. */
  universeSize: 120,
  /** Symbols that reach the expensive 5m/4h + risk-gate stage. */
  deepScanSize: 30,
  /** Suggestions older than this are considered stale. */
  dataFreshnessMs: 5 * 60 * 1000,
  /** A manual scan inside this window reuses the cached payload. */
  manualScanCooldownMs: 30 * 1000,
  /** Number of klines requested per interval. */
  klineLimit: 200,
} as const;

/** Weights of the 100-point score. Must sum to 100. */
export const SCORE_WEIGHTS = {
  trend: 25,
  momentum: 20,
  volume: 15,
  entry: 15,
  liquidity: 10,
  riskReward: 10,
  market: 5,
} as const;

/** Penalty table, all values are points *removed*. */
export const PENALTIES = {
  rsiOverbought: 10,
  rsiExtreme: 15,
  distanceEma21Wide: 6,
  distanceEma21Extreme: 12,
  singleCandlePump: 8,
  rally24hExtended: 5,
  upperWickHeavy: 6,
  atrVolatilityExtreme: 5,
} as const;

/** Thresholds that drive penalties / hard rejects. */
export const THRESHOLDS = {
  rsiExtreme: 82,
  distanceEma21WideAtr: 2,
  distanceEma21ExtremeAtr: 3,
  singleCandlePumpPct: 7,
  rally24hExtendedPct: 20,
  rally24hRejectPct: 35,
  upperWickHeavyRatio: 0.45,
  /** ATR as a percentage of price below which the market is too quiet. */
  atrPctTooQuiet: 0.25,
  /** ATR as a percentage of price above which volatility is extreme. */
  atrPctExtreme: 6,
  /** Minimum bars of history required before an interval is scored. */
  minBars: 60,
  /** Breakout must not be more than this far beyond the 20-bar high. */
  maxBreakoutExtensionPct: 1.5,
  /** Volume ratio required to confirm a breakout. */
  breakoutVolumeRatio: 1.5,
} as const;

/** Volume-ratio scoring curve: inclusive lower bound -> points. */
export const VOLUME_RATIO_BANDS: ReadonlyArray<{ min: number; points: number }> = [
  { min: 2, points: 12 },
  { min: 1.5, points: 10 },
  { min: 1.2, points: 6 },
  { min: 1.0, points: 3 },
];

/** RSI scoring curve used by the momentum bucket. */
export const RSI_BANDS: ReadonlyArray<{ min: number; max: number; points: number }> = [
  { min: 55, max: 64, points: 14 },
  { min: 64, max: 70, points: 10 },
  { min: 70, max: 75, points: 4 },
];

/** BTC regime tuning. */
export const REGIME_CONFIG = {
  /** Applied to every altcoin score while BTC is risk-on/off. */
  riskOnPoints: 5,
  neutralPoints: 0,
  riskOffPoints: -5,
  /** BTC RSI below this contributes to a risk-off call. */
  riskOffRsi: 45,
  /** A single 1h drop beyond this forces a risk-off call. */
  crashPct1h: 4,
} as const;

/** Liquidity buckets for the liquidity score. */
export const LIQUIDITY_BANDS: ReadonlyArray<{ minQuoteVolume: number; points: number }> = [
  { minQuoteVolume: 50_000_000, points: 10 },
  { minQuoteVolume: 20_000_000, points: 8 },
  { minQuoteVolume: 10_000_000, points: 6 },
  { minQuoteVolume: 5_000_000, points: 4 },
];

/** Base assets excluded from the universe (stablecoins and derivatives). */
export const EXCLUDED_BASE_ASSETS: ReadonlySet<string> = new Set([
  "USDC",
  "FDUSD",
  "TUSD",
  "BUSD",
  "DAI",
  "USDP",
  "EUR",
  "GBP",
  "TRY",
  "BRL",
  "ARS",
  "AEUR",
  "PAXG",
  "USD1",
  "XUSD",
  "EURI",
]);

/** Quote asset accepted by the scanner. */
export const QUOTE_ASSET = "USDT";

/** Leveraged-token suffix/prefix patterns that must never be traded. */
export const EXCLUDED_SYMBOL_PATTERNS: ReadonlyArray<RegExp> = [
  /UPUSDT$/,
  /DOWNUSDT$/,
  /BULLUSDT$/,
  /BEARUSDT$/,
];

/** Weight distribution used inside the 25-point trend bucket. */
export const TREND_SUB_WEIGHTS = {
  stack: 12,
  slope: 8,
  structure: 5,
} as const;

/** Weight distribution used inside the 15-point entry bucket. */
export const ENTRY_SUB_WEIGHTS = {
  distance: 8,
  pattern: 7,
} as const;

/** Weight distribution used inside the 10-point risk/reward bucket. */
export const RISK_REWARD_SUB_WEIGHTS = {
  roomToResistance: 6,
  invalidationDistance: 4,
} as const;

/** Non-fatal warnings surfaced to the UI. */
export const WARNING_CODES = {
  dataStale: "DATA_STALE",
  btcRiskOff: "BTC_RISK_OFF",
  extended: "EXTENDED_FROM_EMA21",
  thinLiquidity: "THIN_LIQUIDITY",
  newsUnknown: "NEWS_UNAVAILABLE",
} as const;

/** Bumped whenever the scoring rules change so stored scans stay comparable. */
export const SCORING_VERSION = STRATEGY_VERSION;
