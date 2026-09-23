/**
 * The single HTTP gateway to Binance public market data.
 *
 * Everything the scan learns about the market comes through this class, which
 * is why the hardening lives here rather than in callers:
 *
 * - **timeout** — every attempt is aborted after `REQUEST_TIMEOUT_MS`.
 * - **retry** — transient failures (network, 5xx, 429) are retried with
 *   exponential backoff, bounded by `MAX_ATTEMPTS` per host.
 * - **fallback endpoint** — hosts are tried in `BINANCE_REST_BASE_URLS` order,
 *   so a single degraded mirror cannot take the scan down.
 * - **rate-limit awareness** — the `X-MBX-USED-WEIGHT-1M` counters Binance
 *   reports on every response are tracked and paced against the advertised
 *   minute budget; a `429` is honoured via `Retry-After` instead of hammering,
 *   and a `418` bans that host immediately for `BAN_COOLDOWN_MS`.
 *
 * When no host can serve a request the client throws a `BinanceError` carrying
 * `DATA_UNAVAILABLE`. It never returns partial, stale or fabricated data — the
 * scanner must surface "no data" rather than invent a recommendation.
 */

import {
  BAN_COOLDOWN_MS,
  BINANCE_REST_BASE_URLS,
  GEO_BLOCK_COOLDOWN_MS,
  MAX_ATTEMPTS,
  MAX_RETRY_AFTER_MS,
  REQUEST_TIMEOUT_MS,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  SYMBOLS_PER_BATCH,
  WEIGHT_HARD_LIMIT,
  WEIGHT_LIMIT_PER_MINUTE,
  WEIGHT_PACE_DELAY_MS,
  WEIGHT_SOFT_LIMIT,
} from "@/config/api";
import type { BookTicker, Interval, Kline, SymbolInfo, Ticker24h } from "@/shared/types";
import { BinanceError } from "./errors";
import {
  parseBookTicker,
  parseExchangeInfo,
  parseKlines,
  parseRetryAfterMs,
  parseTicker24h,
  parseUsedWeight,
} from "./parse";

/**
 * Upper bound on simultaneous in-flight requests. Binance limits by weight, not
 * by connections, but a small pool keeps one slow endpoint from opening dozens
 * of sockets and makes the weight pacing below meaningful.
 */
const MAX_CONCURRENT_REQUESTS = 4;

/** Process-wide view of the current minute's request-weight budget (per IP). */
let observedWeight = 0;

/** Hosts that answered with HTTP 418, banned until the stored timestamp. */
const bannedUntil = new Map<string, number>();

/**
 * Hosts that refused us for geographic reasons, skipped until the timestamp.
 *
 * A blocked egress stays blocked for the life of the deployment, so probing it
 * on all ~300 calls of a scan would add minutes of latency for nothing. The
 * cooldown is process-wide on purpose: the whole Worker isolate shares one
 * egress, so one refusal is evidence about every later request.
 */
const geoBlockedUntil = new Map<string, number>();

/**
 * Markers that identify a geographic refusal rather than a request error.
 *
 * Binance answers 451 with an explicit restricted-location message and 403 with
 * an edge HTML page; both mean "this IP is not welcome", never "your request was
 * malformed", so retrying or falling back to the same host is pointless.
 */
const GEO_BLOCK_BODY_MARKERS: readonly string[] = [
  "restricted location",
  "service unavailable from a restricted",
  "403 forbidden",
];

/** True when a non-OK response is Binance refusing our egress location. */
function isGeographicBlock(status: number, body: string): boolean {
  if (status === 451) return true;
  if (status !== 403 && status !== 400) return false;
  const lowered = body.toLowerCase();
  return GEO_BLOCK_BODY_MARKERS.some((marker) => lowered.includes(marker));
}

/** Test hook: forget per-process rate-limit and cooldown state. */
export function resetRateLimitState(): void {
  observedWeight = 0;
  bannedUntil.clear();
  geoBlockedUntil.clear();
}

export interface BinanceMarketClientOptions {
  /** Overrides `BINANCE_REST_BASE_URLS` (used by tests and smoke scripts). */
  readonly baseUrls?: readonly string[];
  /** Injectable transport; defaults to the platform `fetch`. */
  readonly fetchImpl?: typeof fetch;
  /** Injectable sleep so tests need not wall-clock wait. */
  readonly sleepImpl?: (ms: number) => Promise<void>;
  /** Injectable clock for ban-window tests. */
  readonly now?: () => number;
  /** Attempts per host before moving on to the next endpoint. */
  readonly maxAttempts?: number;
  /** Per-attempt timeout override. */
  readonly requestTimeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Minimal transport for the Binance Spot market-data endpoints we use. */
export class BinanceMarketClient {
  private readonly baseUrls: readonly string[];
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly nowImpl: () => number;
  private readonly maxAttempts: number;
  private readonly requestTimeoutMs: number;

  constructor(options: BinanceMarketClientOptions = {}) {
    this.baseUrls = options.baseUrls ?? BINANCE_REST_BASE_URLS;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.sleepImpl = options.sleepImpl ?? sleep;
    this.nowImpl = options.now ?? Date.now;
    this.maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  /**
   * All Spot symbols currently quoted in USDT and open for trading.
   * Used to build the scan universe (not to score anything).
   */
  async exchangeInfo(): Promise<SymbolInfo[]> {
    return this.request(
      "/api/v3/exchangeInfo",
      null,
      (payload) => parseExchangeInfo(payload),
      "exchangeInfo",
    );
  }

  /**
   * 24h rolling statistics. With `symbols`, the list is split into batches of
   * `SYMBOLS_PER_BATCH` (Binance's cap per call) and fetched with bounded
   * concurrency; without it, Binance returns the whole market in one call.
   */
  async ticker24h(symbols?: readonly string[]): Promise<Ticker24h[]> {
    if (symbols === undefined) {
      return this.request(
        "/api/v3/ticker/24hr",
        null,
        (payload) => parseTicker24h(payload),
        "ticker24h",
      );
    }
    if (symbols.length === 0) return [];
    const batches = chunk(symbols, SYMBOLS_PER_BATCH);
    const results = await this.pool(batches, MAX_CONCURRENT_REQUESTS, (batch) =>
      this.request(
        "/api/v3/ticker/24hr",
        () => new URLSearchParams({ symbols: JSON.stringify(batch) }).toString(),
        (payload) => parseTicker24h(payload, "ticker24h"),
        "ticker24h",
      ),
    );
    return results.flat();
  }

  /** Best bid/ask snapshots, batched exactly like `ticker24h`. */
  async bookTicker(symbols: readonly string[]): Promise<BookTicker[]> {
    if (symbols.length === 0) return [];
    const batches = chunk(symbols, SYMBOLS_PER_BATCH);
    const results = await this.pool(batches, MAX_CONCURRENT_REQUESTS, (batch) =>
      this.request(
        "/api/v3/ticker/bookTicker",
        () => new URLSearchParams({ symbols: JSON.stringify(batch) }).toString(),
        (payload) => parseBookTicker(payload, "bookTicker"),
        "bookTicker",
      ),
    );
    return results.flat();
  }

  /** Current order-book depth for one symbol. */
  async depth(symbol: string, limit = 100): Promise<unknown> {
    const safeLimit = [5, 10, 20, 50, 100, 500, 1000, 5000].includes(limit)
      ? limit
      : 100;
    return this.request(
      "/api/v3/depth",
      () => new URLSearchParams({ symbol, limit: String(safeLimit) }).toString(),
      (payload) => payload,
      `depth:${symbol}`,
    );
  }

  /** Most recent public trades for one symbol. */
  async trades(symbol: string, limit = 100): Promise<unknown> {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 1_000));
    return this.request(
      "/api/v3/trades",
      () => new URLSearchParams({ symbol, limit: String(safeLimit) }).toString(),
      (payload) => payload,
      `trades:${symbol}`,
    );
  }

  /** Binance's trade-price average for the preceding `mins` minutes. */
  async avgPrice(symbol: string, mins = 5): Promise<unknown> {
    const safeMins = Math.max(1, Math.min(Math.trunc(mins), 60));
    return this.request(
      "/api/v3/avgPrice",
      () => new URLSearchParams({ symbol, mins: String(safeMins) }).toString(),
      (payload) => payload,
      `avgPrice:${symbol}`,
    );
  }

  /**
   * Recent candles for one symbol/interval, oldest first (as Binance sends).
   *
   * The optional `options` argument narrows the window server-side, which is
   * what lets historical tooling page backwards through months of candles the
   * 1000-bar `limit` alone cannot reach. Omitted or non-finite bounds are
   * dropped from the query so live scan callers are unaffected.
   */
  async klines(
    symbol: string,
    interval: Interval,
    limit: number,
    options: { startTime?: number; endTime?: number } = {},
  ): Promise<Kline[]> {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 1_000));
    const startTime = Number.isFinite(options.startTime) ? options.startTime : undefined;
    const endTime = Number.isFinite(options.endTime) ? options.endTime : undefined;
    const label = `klines:${symbol}:${interval}`;
    return this.request(
      "/api/v3/klines",
      () => {
        const query = new URLSearchParams({
          symbol,
          interval,
          limit: String(safeLimit),
        });
        if (startTime !== undefined) query.set("startTime", String(Math.trunc(startTime)));
        if (endTime !== undefined) query.set("endTime", String(Math.trunc(endTime)));
        return query.toString();
      },
      (payload) => parseKlines(payload, label),
      label,
    );
  }

  /**
   * Fetches one path across every configured host, retrying transient failures
   * per host. Resolves with parsed data only when a host answered 200 with a
   * payload that parsed cleanly.
   */
  private async request<T>(
    path: string,
    buildQuery: (() => string) | null,
    parse: (payload: unknown) => T,
    endpoint: string,
  ): Promise<T> {
    const query = buildQuery === null ? "" : buildQuery();
    const target = query.length > 0 ? `${path}?${query}` : path;
    const failures: string[] = [];
    let sawIpBan = false;

    for (const baseUrl of this.baseUrls) {
      const host = hostOf(baseUrl);
      const geoBlockMs = this.geoBlockRemainingMs(host);
      if (geoBlockMs > 0) {
        failures.push(`${host}: skipped, blocked for our region`);
        continue;
      }
      const bannedForMs = this.banRemainingMs(host);
      if (bannedForMs > 0) {
        sawIpBan = true;
        failures.push(`${host}: in cooldown for ${Math.ceil(bannedForMs / 1_000)}s after HTTP 418`);
        continue;
      }

      for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
        await this.awaitWeightBudget(endpoint);

        let response: Response;
        try {
          response = await this.fetchImpl(`${baseUrl}${target}`, {
            method: "GET",
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(this.requestTimeoutMs),
          });
        } catch (error) {
          failures.push(`${host}: ${messageOf(error)}`);
          if (attempt < this.maxAttempts) await this.backoff(attempt);
          continue;
        }

        this.observeWeight(response.headers);

        if (response.status === 418) {
          // Binance only sends 418 for repeated, excessive 429s. Stop at once.
          bannedUntil.set(host, this.nowImpl() + BAN_COOLDOWN_MS);
          sawIpBan = true;
          failures.push(`${host}: HTTP 418, host banned for ${BAN_COOLDOWN_MS / 1_000}s`);
          break;
        }

        if (response.status === 429) {
          const headerMs = parseRetryAfterMs(response.headers.get("retry-after"));
          const waitMs = Math.min(
            headerMs ?? this.backoffDelay(attempt),
            MAX_RETRY_AFTER_MS,
          );
          failures.push(`${host}: HTTP 429, waiting ${waitMs}ms before retrying`);
          await this.sleepImpl(waitMs);
          continue;
        }

        if (response.status >= 500) {
          failures.push(`${host}: HTTP ${response.status}`);
          if (attempt < this.maxAttempts) await this.backoff(attempt);
          continue;
        }

        if (!response.ok) {
          // A 4xx is either a request-level error (retrying repeats it) or the
          // venue refusing our egress location. The status alone cannot tell the
          // two apart — Binance answers 403 from its edge as well — so read the
          // body to decide whether to skip this host for the rest of the scan.
          let body = "";
          try {
            body = (await response.text()).slice(0, 512);
          } catch {
            body = "";
          }
          if (isGeographicBlock(response.status, body)) {
            geoBlockedUntil.set(host, this.nowImpl() + GEO_BLOCK_COOLDOWN_MS);
            failures.push(`${host}: HTTP ${response.status}, blocked for our region`);
          } else {
            failures.push(`${host}: HTTP ${response.status}`);
          }
          break;
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch (error) {
          failures.push(`${host}: unreadable JSON body (${messageOf(error)})`);
          if (attempt < this.maxAttempts) await this.backoff(attempt);
          continue;
        }

        try {
          return parse(payload);
        } catch (error) {
          failures.push(`${host}: ${messageOf(error)}`);
          if (attempt < this.maxAttempts) await this.backoff(attempt);
        }
      }
    }

    const detail = failures.slice(0, 3).join("; ");
    throw new BinanceError(
      `no endpoint could serve ${endpoint}${detail.length > 0 ? ` (${detail})` : ""}`,
      {
        code: "DATA_UNAVAILABLE",
        endpoint,
        ...(sawIpBan ? { cause: "IP_BANNED" } : {}),
      },
    );
  }

  /** Bounded-concurrency map that preserves input order. */
  private async pool<T, R>(
    items: readonly T[],
    limit: number,
    run: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array<R>(items.length);
    let cursor = 0;
    const workers = Math.max(1, Math.min(limit, items.length));
    await Promise.all(
      Array.from({ length: workers }, async () => {
        for (;;) {
          const index = cursor;
          cursor += 1;
          if (index >= items.length) return;
          const item = items[index];
          if (item === undefined) return;
          results[index] = await run(item);
        }
      }),
    );
    return results;
  }

  /** Milliseconds left on a host's geographic skip, or 0 when it may be tried. */
  private geoBlockRemainingMs(host: string): number {
    const until = geoBlockedUntil.get(host);
    if (until === undefined) return 0;
    const remaining = until - this.nowImpl();
    if (remaining <= 0) {
      geoBlockedUntil.delete(host);
      return 0;
    }
    return remaining;
  }

  private banRemainingMs(host: string): number {
    const until = bannedUntil.get(host);
    if (until === undefined) return 0;
    const remaining = until - this.nowImpl();
    if (remaining <= 0) {
      bannedUntil.delete(host);
      return 0;
    }
    return remaining;
  }

  /**
   * Honours Binance's own weight counters: past the soft limit we pause before
   * starting another call, past the hard limit we refuse and let the caller
   * degrade to "no data" instead of risking a ban.
   */
  private async awaitWeightBudget(endpoint: string): Promise<void> {
    const hardLimit = WEIGHT_HARD_LIMIT * WEIGHT_LIMIT_PER_MINUTE;
    const softLimit = WEIGHT_SOFT_LIMIT * WEIGHT_LIMIT_PER_MINUTE;
    if (observedWeight >= hardLimit) {
      throw new BinanceError(
        `request weight ${observedWeight} reached the hard limit (${hardLimit})`,
        { code: "DATA_UNAVAILABLE", endpoint },
      );
    }
    if (observedWeight >= softLimit) {
      await this.sleepImpl(WEIGHT_PACE_DELAY_MS);
    }
  }

  private observeWeight(headers: Headers): void {
    const reported = parseUsedWeight(headers);
    if (reported !== null) observedWeight = reported;
  }

  private backoffDelay(attempt: number): number {
    return Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
  }

  private async backoff(attempt: number): Promise<void> {
    await this.sleepImpl(this.backoffDelay(attempt));
  }
}

/** Convenience factory for the default (production) client. */
export function createBinanceMarketClient(
  options: BinanceMarketClientOptions = {},
): BinanceMarketClient {
  return new BinanceMarketClient(options);
}
