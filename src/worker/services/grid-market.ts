/** Read-only Binance Global Spot and USD-M futures market data for grid research. */
import { createBinanceMarketClient } from "@/lib/binance/client";
import { parseKlines, parseTicker24h } from "@/lib/binance/parse";
import { filterClosedKlines } from "@/lib/market/candles";
import type { GridInput } from "@/strategy/grid-radar";
import type { GridMarket, GridAnalysis } from "@/shared/grid";
import { analyzeGrid } from "@/strategy/grid-radar";

const SPOT_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"] as const;
const FUTURES_HOST = "https://fapi.binance.com"; // no US venue substitution
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;

export function validGridSymbol(symbol: string): boolean {
  return SYMBOLS.some((value) => value === symbol);
}

async function futuresJson(path: string): Promise<unknown> {
  const response = await fetch(FUTURES_HOST + path, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("Futures public market endpoint unavailable: HTTP " + response.status);
  return response.json() as Promise<unknown>;
}

export async function readGridResearch(
  symbol: string,
  market: GridMarket,
  budgetUsdt: number,
  now = Date.now(),
): Promise<GridAnalysis> {
  if (!validGridSymbol(symbol)) throw new Error("Unsupported grid symbol");
  let input: GridInput;
  if (market === "spot") {
    // Do not silently mix Binance.US spot liquidity with global Spot assumptions.
    const client = createBinanceMarketClient({ baseUrls: SPOT_HOSTS });
    const [oneHour, fourHour, tickers] = await Promise.all([
      client.klines(symbol, "1h", 130),
      client.klines(symbol, "4h", 130),
      client.ticker24h([symbol]),
    ]);
    const ticker = tickers.find((row) => row.symbol === symbol);
    if (!ticker) throw new Error("Spot ticker unavailable");
    input = {
      symbol, market, now, budgetUsdt, price: ticker.lastPrice,
      change24hPct: ticker.priceChangePercent, quoteVolume24h: ticker.quoteVolume,
      fundingRate: null,
      candles1h: filterClosedKlines(oneHour, now),
      candles4h: filterClosedKlines(fourHour, now),
    };
  } else {
    const encoded = encodeURIComponent(symbol);
    const [rawOneHour, rawFourHour, rawTicker, rawFunding] = await Promise.all([
      futuresJson("/fapi/v1/klines?symbol=" + encoded + "&interval=1h&limit=130"),
      futuresJson("/fapi/v1/klines?symbol=" + encoded + "&interval=4h&limit=130"),
      futuresJson("/fapi/v1/ticker/24hr?symbol=" + encoded),
      futuresJson("/fapi/v1/premiumIndex?symbol=" + encoded),
    ]);
    const ticker = parseTicker24h(rawTicker)[0];
    const funding = rawFunding as Record<string, unknown> | null;
    const fundingRate = funding?.symbol === symbol && typeof funding.lastFundingRate === "string"
      ? Number(funding.lastFundingRate) : Number.NaN;
    if (!ticker || ticker.symbol !== symbol || !Number.isFinite(fundingRate)) {
      throw new Error("USD-M data missing funding information");
    }
    input = {
      symbol, market, now, budgetUsdt, price: ticker.lastPrice,
      change24hPct: ticker.priceChangePercent, quoteVolume24h: ticker.quoteVolume,
      fundingRate,
      candles1h: filterClosedKlines(parseKlines(rawOneHour), now),
      candles4h: filterClosedKlines(parseKlines(rawFourHour), now),
    };
  }
  return analyzeGrid(input);
}
