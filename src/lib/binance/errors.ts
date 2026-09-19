/**
 * Failure types for the Binance market-data client.
 *
 * The contract that matters: a caller can never mistake a transport failure
 * for market data. Anything the client cannot fetch becomes a `BinanceError`
 * carrying `DATA_UNAVAILABLE`, which the scanner surfaces verbatim instead of
 * producing a recommendation from stale or partial input.
 */

export type BinanceErrorCode = "DATA_UNAVAILABLE" | "RATE_LIMITED" | "IP_BANNED";

export interface BinanceErrorOptions {
  code: BinanceErrorCode;
  endpoint: string;
  status?: number;
  cause?: unknown;
}

export class BinanceError extends Error {
  readonly code: BinanceErrorCode;
  readonly endpoint: string;
  readonly status?: number;

  constructor(message: string, options: BinanceErrorOptions) {
    super(message);
    this.name = "BinanceError";
    this.code = options.code;
    this.endpoint = options.endpoint;
    this.status = options.status;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  /**
   * Client-side code the API layer maps onto the `ApiError.code` contract.
   * Everything transport-shaped collapses to `DATA_UNAVAILABLE`.
   */
  get apiCode(): "DATA_UNAVAILABLE" {
    return "DATA_UNAVAILABLE";
  }
}

export function isBinanceError(value: unknown): value is BinanceError {
  return value instanceof BinanceError;
}

/** Human-readable, secret-free description used in `risks` and logs. */
export function describeBinanceError(error: unknown, endpoint = "unknown"): string {
  if (isBinanceError(error)) {
    const status = error.status === undefined ? "" : ` (HTTP ${error.status})`;
    return `${error.endpoint}${status}: ${error.message}`;
  }
  if (error instanceof Error) return `${endpoint}: ${error.message}`;
  return `${endpoint}: unknown error`;
}
