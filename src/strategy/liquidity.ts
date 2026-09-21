/**
 * Stage 2 of the scan funnel: rank the USDT universe by how tradeable it
 * actually is, using 24h quote volume plus the live book spread.
 *
 * A symbol that cannot be entered and exited without slippage is never a good
 * signal, no matter how pretty the chart looks.
 */

import { LIQUIDITY_BANDS, SCAN_CONFIG } from "@/config/strategy";
import type { BookTicker, Ticker24h } from "@/shared/types";
import { spreadPct } from "@/lib/binance/parse";

/** Spread verdict thresholds from the strategy config. */
export type SpreadVerdict = "PREFERRED" | "ACCEPTABLE" | "REJECTED";

export interface LiquidityCandidate {
  symbol: string;
  quoteVolume24h: number;
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  /** Live spread in percent; `null` when no book ticker was available. */
  spreadPct: number | null;
  spreadVerdict: SpreadVerdict;
  /** 0-10 points from `LIQUIDITY_BANDS`. */
  liquidityPoints: number;
}

/** 24h quote volume in USDT must clear the configured floor. */
export function passesVolumeFloor(quoteVolume24h: number): boolean {
  return Number.isFinite(quoteVolume24h) && quoteVolume24h >= SCAN_CONFIG.minQuoteVolume24h;
}

/** Step-shaped liquidity score so a 5M pair cannot outscore a 50M pair. */
export function liquidityPoints(quoteVolume24h: number): number {
  for (const band of LIQUIDITY_BANDS) {
    if (quoteVolume24h >= band.minQuoteVolume) return band.points;
  }
  return 0;
}

/** >0.60% is untradeable; <=0.30% is ideal; between is workable but penalised. */
export function judgeSpread(spread: number | null): SpreadVerdict {
  if (spread === null || !Number.isFinite(spread)) return "REJECTED";
  if (spread <= SCAN_CONFIG.preferredSpreadPct) return "PREFERRED";
  if (spread <= SCAN_CONFIG.maxSpreadPct) return "ACCEPTABLE";
  return "REJECTED";
}

export function isSpreadTradable(spread: number | null): boolean {
  return judgeSpread(spread) !== "REJECTED";
}

/**
 * Joins the 24h ticker batch with the book-ticker batch and returns every
 * symbol that clears the volume floor, best liquidity first.
 */
export function buildLiquidityCandidates(
  tickers: readonly Ticker24h[],
  books: readonly BookTicker[],
): LiquidityCandidate[] {
  const spreadBySymbol = new Map<string, number>();
  for (const book of books) {
    spreadBySymbol.set(book.symbol, spreadPct(book));
  }

  const candidates: LiquidityCandidate[] = [];
  for (const ticker of tickers) {
    if (!passesVolumeFloor(ticker.quoteVolume)) continue;
    const rawSpread = spreadBySymbol.get(ticker.symbol);
    const spread = rawSpread === undefined ? null : rawSpread;
    candidates.push({
      symbol: ticker.symbol,
      quoteVolume24h: ticker.quoteVolume,
      lastPrice: ticker.lastPrice,
      priceChangePercent: ticker.priceChangePercent,
      highPrice: ticker.highPrice,
      lowPrice: ticker.lowPrice,
      spreadPct: spread,
      spreadVerdict: judgeSpread(spread),
      liquidityPoints: liquidityPoints(ticker.quoteVolume),
    });
  }

  candidates.sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);
  return candidates;
}

/**
 * The symbols worth spending kline weight on: top N by volume, dropping
 * anything whose spread already disqualifies a fresh entry.
 */
export function selectTechnicalScanSet(
  candidates: readonly LiquidityCandidate[],
  limit: number = SCAN_CONFIG.universeSize,
): LiquidityCandidate[] {
  return candidates.filter((candidate) => isSpreadTradable(candidate.spreadPct)).slice(0, limit);
}
