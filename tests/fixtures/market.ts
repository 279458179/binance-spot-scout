import type { BinanceMarketClient } from "@/lib/binance";
import type {
  BookTicker,
  Kline,
  SymbolInfo,
  Ticker24h,
} from "@/shared/types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const INTERVAL_MS: Record<string, number> = {
  "5m": 5 * MINUTE,
  "15m": 15 * MINUTE,
  "1h": HOUR,
  "4h": 4 * HOUR,
};

export interface KlineShape {
  /** Close price of the final candle. */
  close: number;
  /** Fractional move applied between consecutive candles (0.001 = +0.1%). */
  drift?: number;
  /** Candle body size as a fraction of price. */
  bodyPct?: number;
  /** Percentage of the range taken by the upper wick. */
  upperWickPct?: number;
  /** Percentage of the range taken by the lower wick. */
  lowerWickPct?: number;
  /** Volume for every candle unless `finalVolume` overrides the last one. */
  volume?: number;
  /** Volume used for the newest candle (drives volume ratio). */
  finalVolume?: number;
  /** Close time of the newest candle, as an offset from now in ms. */
  closeTimeOffsetMs?: number;
}

/**
 * Builds a deterministic kline series whose newest candle carries the caller's
 * requested shape. Prices grow by `drift` each step and the body/wick split is
 * applied only to the final candle so indicator maths stays predictable.
 */
export function makeKlines(
  interval: string,
  count: number,
  shape: KlineShape,
): Kline[] {
  const step = INTERVAL_MS[interval] ?? MINUTE;
  const now = Date.now();
  const drift = shape.drift ?? 0;
  const bodyPct = shape.bodyPct ?? 0.004;
  const upperWickPct = shape.upperWickPct ?? 0.1;
  const lowerWickPct = shape.lowerWickPct ?? 0.1;
  const volume = shape.volume ?? 1_000;

  // Walk backwards from the target close so the last candle lands on `close`.
  const closes: number[] = new Array(count);
  let price = shape.close;
  for (let i = count - 1; i >= 0; i -= 1) {
    closes[i] = price;
    price /= 1 + drift;
  }

  return closes.map((close, index) => {
    const isLast = index === count - 1;
    const open = isLast
      ? close / (1 + bodyPct)
      : index === 0
        ? close
        : closes[index - 1];
    const bodyTop = Math.max(open, close);
    const bodyBottom = Math.min(open, close);
    const bodyRange = Math.max(bodyTop - bodyBottom, close * 0.0001);
    const high = bodyTop + bodyRange * upperWickPct;
    const low = bodyBottom - bodyRange * lowerWickPct;
    const closeTime =
      now - (count - 1 - index) * step + (isLast ? (shape.closeTimeOffsetMs ?? -MINUTE) : 0);
    return {
      openTime: closeTime - step,
      open: round8(open),
      high: round8(high),
      low: round8(low),
      close: round8(close),
      volume: isLast && shape.finalVolume !== undefined ? shape.finalVolume : volume,
      closeTime,
      quoteVolume:
        (isLast && shape.finalVolume !== undefined ? shape.finalVolume : volume) * close,
      trades: 100,
      takerBuyBase: 50,
      takerBuyQuote: 50 * close,
    };
  });
}

export function makeKline(overrides: Partial<Kline> = {}): Kline {
  const base = 100;
  return {
    openTime: 0,
    open: base,
    high: base * 1.01,
    low: base * 0.99,
    close: base,
    volume: 1_000,
    closeTime: 60_000,
    quoteVolume: 100_000,
    trades: 10,
    takerBuyBase: 500,
    takerBuyQuote: 50_000,
    ...overrides,
  };
}

export function makeTicker(overrides: Partial<Ticker24h> = {}): Ticker24h {
  return {
    symbol: "BTCUSDT",
    lastPrice: 100,
    priceChangePercent: 1,
    quoteVolume: 100_000_000,
    volume: 1_000_000,
    highPrice: 102,
    lowPrice: 98,
    openPrice: 99,
    count: 10_000,
    ...overrides,
  };
}

export function makeBook(overrides: Partial<BookTicker> = {}): BookTicker {
  return {
    symbol: "BTCUSDT",
    bidPrice: 99.99,
    bidQty: 10,
    askPrice: 100.01,
    askQty: 10,
    ...overrides,
  };
}

export function makeSymbolInfo(overrides: Partial<SymbolInfo> = {}): SymbolInfo {
  return {
    symbol: "BTCUSDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    status: "TRADING",
    ...overrides,
  };
}

function round8(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

/** One leg of a hand-authored price path; `to` is the close of the final bar. */
export interface SeriesSegment {
  /** Number of candles in this leg. */
  count: number;
  /** Close price of the candle before the leg starts. */
  from: number;
  /** Close price of the leg's last candle. */
  to: number;
  /**
   * Upper-wick length as a multiple of the candle body. `-1` flattens the wick
   * onto the body, which is how a "clean" candle is authored.
   */
  upperWickPct?: number;
  /** Lower-wick length, same scale as {@link upperWickPct}. */
  lowerWickPct?: number;
  volume?: number;
}

/** A segment list plus the newest candle's shape, for the final override. */
export interface SeriesShape {
  /** Close time of the newest candle, as an offset from now in ms. */
  closeTimeOffsetMs?: number;
  /** Volume used for the newest candle (drives volume ratio). */
  finalVolume?: number;
}

/**
 * Builds an explicit OHLCV series from price legs. Unlike {@link makeKlines}
 * this never derives history from a single close, so callers can author shapes
 * the indicators actually notice: pullbacks, spikes, and reclaims.
 */
export function makeSeries(
  interval: string,
  segments: readonly SeriesSegment[],
  shape: SeriesShape = {},
): Kline[] {
  const step = INTERVAL_MS[interval] ?? MINUTE;
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  const now = Date.now();
  const bars: Array<Omit<Kline, "openTime" | "closeTime">> = [];

  let previousClose = segments[0]?.from ?? 0;
  let index = 0;

  for (const segment of segments) {
    const upperWickPct = segment.upperWickPct ?? 0.1;
    const lowerWickPct = segment.lowerWickPct ?? 0.1;
    const volume = segment.volume ?? 1_000;

    for (let i = 1; i <= segment.count; i += 1) {
      const progress = i / segment.count;
      const close = previousClose + (segment.to - previousClose) * progress;
      const open = index === 0 ? segment.from : previousClose;
      const isLast = index === total - 1;
      const bodyTop = Math.max(open, close);
      const bodyBottom = Math.min(open, close);
      const bodyRange = Math.max(bodyTop - bodyBottom, close * 0.0001);
      const high = isLast
        ? bodyTop + bodyRange * 0.05
        : bodyTop + bodyRange * (1 + upperWickPct);
      const low = bodyBottom - bodyRange * (1 + lowerWickPct);
      const barVolume = isLast && shape.finalVolume !== undefined ? shape.finalVolume : volume;

      bars.push({
        open: round8(open),
        high: round8(high),
        low: round8(low),
        close: round8(close),
        volume: barVolume,
        quoteVolume: barVolume * close,
        trades: 100,
        takerBuyBase: barVolume / 2,
        takerBuyQuote: (barVolume / 2) * close,
      });

      previousClose = close;
      index += 1;
    }
  }

  return bars.map((bar, barIndex) => {
    const isLast = barIndex === total - 1;
    const closeTime =
      now - (total - 1 - barIndex) * step + (isLast ? (shape.closeTimeOffsetMs ?? -MINUTE) : 0);
    return { ...bar, openTime: closeTime - step, closeTime };
  });
}

/** Everything the scanner reads from the market-data client, pre-baked. */
export interface FakeClientData {
  symbols: readonly SymbolInfo[];
  /** Market-wide tickers, returned when `ticker24h()` is called with no args. */
  tickers: readonly Ticker24h[];
  books: readonly BookTicker[];
  /** Klines keyed by `${symbol}|${interval}`. */
  klines: Readonly<Record<string, readonly Kline[]>>;
  /** Fallback keyed by interval when a symbol/interval pair has no explicit fixture. */
  fallbackKlines?: Readonly<Record<string, readonly Kline[]>>;
  /** Per-symbol ticker tweaks merged over the market-wide entry. */
  tickerOverrides?: Readonly<Record<string, Partial<Ticker24h>>>;
}

/** A stand-in for {@link BinanceMarketClient} that serves the baked data above. */
export function makeFakeClient(data: FakeClientData): BinanceMarketClient {
  const tickerBySymbol = new Map<string, Ticker24h>();
  for (const ticker of data.tickers) {
    const override = data.tickerOverrides?.[ticker.symbol];
    tickerBySymbol.set(ticker.symbol, override ? { ...ticker, ...override } : ticker);
  }

  return {
    async exchangeInfo() {
      return [...data.symbols];
    },
    async ticker24h(symbols?: readonly string[]) {
      if (symbols === undefined) return [...tickerBySymbol.values()];
      return symbols.flatMap((symbol) => {
        const ticker = tickerBySymbol.get(symbol);
        return ticker ? [ticker] : [];
      });
    },
    async bookTicker(symbols: readonly string[]) {
      if (symbols.length === 0) return [];
      const wanted = new Set(symbols);
      return data.books.filter((book) => wanted.has(book.symbol));
    },
    async klines(symbol: string, interval: string) {
      return [...(data.klines[`${symbol}|${interval}`] ?? data.fallbackKlines?.[interval] ?? [])];
    },
  } as unknown as BinanceMarketClient;
}
