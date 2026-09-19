/**
 * Market-data transport configuration.
 *
 * Kept apart from `strategy.ts` on purpose: these values describe *how* we
 * talk to Binance, never *what* the strategy considers a good trade. Tuning a
 * threshold must never mean touching a URL.
 */

/**
 * Public market-data hosts, tried in order.
 *
 * `data-api.binance.vision` is the official public market-data mirror (no API
 * key, no account) and is reachable from regions where the trading host is
 * blocked, so it leads. `api.binance.com` is the canonical fallback.
 */
export const BINANCE_REST_BASE_URLS: readonly string[] = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
];

/** Public websocket mirror used for live price tracking on the client. */
export const BINANCE_WS_BASE_URL = "wss://data-stream.binance.vision/ws";

/** Per-attempt request timeout. Market data is useless if it arrives late. */
export const REQUEST_TIMEOUT_MS = 8_000;

/** Attempts per endpoint, per host, before surfacing `DATA_UNAVAILABLE`. */
export const MAX_ATTEMPTS = 3;

/** Exponential backoff base between attempts (250ms, 500ms, ...). */
export const RETRY_BASE_DELAY_MS = 250;

/** Upper bound for a single backoff sleep, so a scan can never stall. */
export const RETRY_MAX_DELAY_MS = 2_000;

/**
 * When Binance reports used request weight above this share of the minute
 * budget we stop starting new calls and let the window drain.
 */
export const WEIGHT_SOFT_LIMIT = 0.8;

/** Hard stop for the current scan when the reported weight reaches this. */
export const WEIGHT_HARD_LIMIT = 0.95;

/**
 * Request-weight allowance per minute, as advertised by `exchangeInfo`
 * (`REQUEST_WEIGHT`, interval `MINUTE`, limit 6000). Used to translate the
 * ratios above into absolute weights.
 */
export const WEIGHT_LIMIT_PER_MINUTE = 6_000;

/** Sleep inserted before the next call once the soft weight limit is crossed. */
export const WEIGHT_PACE_DELAY_MS = 500;

/** Symbols per `ticker/24hr` or `ticker/bookTicker` batch call (Binance cap 100). */
export const SYMBOLS_PER_BATCH = 100;

/** Cap on how long we honour a `Retry-After` header before giving up. */
export const MAX_RETRY_AFTER_MS = 10_000;

/** Treated as "this host is banned" and skipped for the rest of the process. */
export const BAN_COOLDOWN_MS = 120_000;
