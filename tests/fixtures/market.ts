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
