/**
 * Walk-forward backtest of the live scan funnel on real Binance candles.
 *
 * Purpose: replay the exact decision path the worker runs — interval metrics,
 * the coarse screen, the risk gate and the score model — bar by bar over a
 * historical window, then measure what the market did after every ENTRY_NOW
 * verdict. Every decision only reads candles that had already closed at the
 * decision timestamp, so no future data leaks into a verdict.
 *
 * Assumptions worth remembering while reading the numbers: the order book is
 * not replayable, so the risk gate receives a fixed 0.1% spread, and the 24h
 * ticker is reconstructed from the trailing 96 fifteen-minute bars.
 *
 * Run with `npm run backtest`. Requires outbound network access.
 */

import { INTERVALS, SCAN_CONFIG } from "../src/config/strategy";
import { createBinanceMarketClient, describeBinanceError } from "../src/lib/binance/index";
import type { BinanceMarketClient } from "../src/lib/binance/index";
import { buildIntervalMetrics } from "../src/lib/indicators/metrics";
import {
  assessMarketRegime,
  bestPattern,
  detectPatterns,
  detectSupportResistance,
  evaluateRiskGate,
  scoreCandidate,
} from "../src/strategy/index";
import type {
  Interval,
  IntervalMetrics,
  Kline,
  PatternDetection,
  ScanStatus,
  Ticker24h,
} from "../src/shared/types";

const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];
const DEFAULT_DAYS = 30;
const BTC_SYMBOL = "BTCUSDT";

/** Candles per day on each interval the funnel consumes. */
const BARS_PER_DAY_15M = 96;
const BARS_PER_DAY_1H = 24;

/** Rolling lookback handed to the indicator layer, matching `klineLimit`. */
const WINDOW_BARS = 200;

/** Forward horizons, counted in 15m bars. */
const FORWARD_BARS_1H = 4;
const FORWARD_BARS_6H = 24;
const FORWARD_BARS_24H = 96;

/** Binance caps a single klines page at 1000 candles. */
const PAGE_LIMIT = 1000;

/** The order book is not replayable; a tight fixed spread keeps the gate fair. */
const ASSUMED_SPREAD_PCT = 0.1;

interface CliOptions {
  symbols: string[];
  days: number;
}

interface FunnelTotals {
  entryNow: number;
  waitPullback: number;
  noTrade: number;
  thinVolumeSkips: number;
}

interface ForwardStats {
  /** ENTRY_NOW signals whose 24h forward window was fully available. */
  eligible: number;
  /** ENTRY_NOW signals too close to the end of the series to measure. */
  skipped: number;
  hits: number;
  mfe: number[];
  mae: number[];
  return1h: number[];
  return6h: number[];
  return24h: number[];
}

interface BtcContext {
  metrics1h: IntervalMetrics | null;
  dropPct1h: number | null;
}

function stamp(label: string, value: string | number): void {
  console.log(`${label.padEnd(28)} ${value}`);
}

function parseArgs(argv: readonly string[]): CliOptions {
  let symbols = DEFAULT_SYMBOLS;
  let days = DEFAULT_DAYS;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--symbols") {
      symbols = splitSymbols(argv.at(index + 1));
      index += 1;
    } else if (arg.startsWith("--symbols=")) {
      symbols = splitSymbols(arg.slice("--symbols=".length));
    } else if (arg === "--days") {
      days = Number.parseInt(argv.at(index + 1) ?? "", 10);
      index += 1;
    } else if (arg.startsWith("--days=")) {
      days = Number.parseInt(arg.slice("--days=".length), 10);
    }
  }

  const safeDays = Number.isFinite(days) ? Math.max(1, Math.min(Math.trunc(days), 180)) : DEFAULT_DAYS;
  return { symbols, days: safeDays };
}

function splitSymbols(raw: string | undefined): string[] {
  if (raw === undefined) return DEFAULT_SYMBOLS;
  const parsed = raw
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);
  return parsed.length > 0 ? parsed : DEFAULT_SYMBOLS;
}

/**
 * Pages backwards from the most recent candle until `wanted` bars are held.
 *
 * Binance returns candles oldest first and caps a page at 1000 bars, so the
 * loop walks the window back with `endTime = oldest openTime - 1` and de-dupes
 * by `openTime` before returning an ascending, gap-free series.
 */
async function fetchSeries(
  client: BinanceMarketClient,
  symbol: string,
  interval: Interval,
  wanted: number,
): Promise<Kline[]> {
  const byOpenTime = new Map<number, Kline>();
  const maxPages = Math.ceil(wanted / PAGE_LIMIT) + 2;
  let endTime: number | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const batch = await client.klines(
      symbol,
      interval,
      PAGE_LIMIT,
      endTime === undefined ? {} : { endTime },
    );
    if (batch.length === 0) break;
    for (const kline of batch) byOpenTime.set(kline.openTime, kline);
    if (byOpenTime.size >= wanted) break;
    const oldest = batch.at(0);
    if (oldest === undefined) break;
    endTime = oldest.openTime - 1;
    if (batch.length < PAGE_LIMIT) break;
  }

  return [...byOpenTime.values()]
    .sort((left, right) => left.openTime - right.openTime)
    .slice(-wanted);
}

/** The trailing 96 fifteen-minute bars, shaped like a `Ticker24h`. */
function synthesiseTicker(symbol: string, window: readonly Kline[]): Ticker24h | null {
  const first = window.at(0);
  const last = window.at(-1);
  if (first === undefined || last === undefined) return null;

  let highPrice = Number.NEGATIVE_INFINITY;
  let lowPrice = Number.POSITIVE_INFINITY;
  let volume = 0;
  let quoteVolume = 0;
  let count = 0;

  for (const kline of window) {
    if (kline.high > highPrice) highPrice = kline.high;
    if (kline.low < lowPrice) lowPrice = kline.low;
    volume += kline.volume;
    quoteVolume += kline.quoteVolume;
    count += kline.trades;
  }

  return {
    symbol,
    lastPrice: last.close,
    priceChangePercent: first.open > 0 ? (last.close / first.open - 1) * 100 : 0,
    quoteVolume,
    volume,
    highPrice,
    lowPrice,
    openPrice: first.open,
    count,
  };
}

/**
 * BTC context as of one decision timestamp: the 1h snapshot plus the 1h drop.
 *
 * `reusedMetrics` lets the BTC symbol hand over the trend snapshot it already
 * computed, since that window is identical to the regime window.
 */
function btcContextAt(
  klineSeries: readonly Kline[],
  decisionTime: number,
  reusedMetrics: IntervalMetrics | null,
): BtcContext {
  const window = klineSeries
    .filter((kline) => kline.closeTime <= decisionTime)
    .slice(-WINDOW_BARS);
  const last = window.at(-1);
  const previous = window.at(-2);

  const metrics1h = reusedMetrics ?? buildIntervalMetrics(INTERVALS.trend, window);
  const dropPct1h =
    last !== undefined && previous !== undefined && previous.close > 0
      ? ((previous.close - last.close) / previous.close) * 100
      : null;

  return { metrics1h, dropPct1h };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return null;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[middle - 1];
  return lower === undefined ? upper : (lower + upper) / 2;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percent(value: number | null): string {
  if (value === null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function withSample(text: string, sampleSize: number): string {
  return sampleSize === 0 ? "n/a" : `${text} (n=${sampleSize})`;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const options = parseArgs(process.argv.slice(2));
  const client = createBinanceMarketClient();

  console.log("=== 1. loading historical klines ===");
  stamp("symbols", options.symbols.join(", "));
  stamp("window (days)", options.days);

  const primaryWanted = options.days * BARS_PER_DAY_15M + FORWARD_BARS_24H + WINDOW_BARS;
  const trendWanted = options.days * BARS_PER_DAY_1H + BARS_PER_DAY_1H + WINDOW_BARS;

  const primarySeries = new Map<string, Kline[]>();
  const trendSeries = new Map<string, Kline[]>();
  const failedSymbols: string[] = [];

  for (const symbol of options.symbols) {
    try {
      const primary = await fetchSeries(client, symbol, INTERVALS.primary, primaryWanted);
      const trend = await fetchSeries(client, symbol, INTERVALS.trend, trendWanted);
      if (primary.length <= WINDOW_BARS || trend.length < WINDOW_BARS) {
        failedSymbols.push(symbol);
        console.error(`  ${symbol}: not enough history (15m ${primary.length}, 1h ${trend.length})`);
        continue;
      }
      primarySeries.set(symbol, primary);
      trendSeries.set(symbol, trend);
      stamp(`${symbol} 15m bars`, primary.length);
      stamp(`${symbol} 1h bars`, trend.length);
    } catch (error) {
      failedSymbols.push(symbol);
      console.error(`  ${symbol}: ${describeBinanceError(error, `backtest:${symbol}`)}`);
    }
  }

  let btcTrend = trendSeries.get(BTC_SYMBOL);
  if (btcTrend === undefined) {
    console.log(`\n${BTC_SYMBOL} 1h series not in the requested set; fetching it for regime context`);
    btcTrend = await fetchSeries(client, BTC_SYMBOL, INTERVALS.trend, trendWanted);
    stamp(`${BTC_SYMBOL} 1h bars (context)`, btcTrend.length);
  }

  const totals: FunnelTotals = {
    entryNow: 0,
    waitPullback: 0,
    noTrade: 0,
    thinVolumeSkips: 0,
  };
  const forward: ForwardStats = {
    eligible: 0,
    skipped: 0,
    hits: 0,
    mfe: [],
    mae: [],
    return1h: [],
    return6h: [],
    return24h: [],
  };

  console.log("");
  console.log("=== 2. replaying the scan funnel ===");
  stamp("assumed spread", `${ASSUMED_SPREAD_PCT.toFixed(2)}%`);

  let analysedSymbols = 0;
  for (const symbol of options.symbols) {
    const symbolPrimary = primarySeries.get(symbol);
    const symbolTrend = trendSeries.get(symbol);
    if (symbolPrimary === undefined || symbolTrend === undefined) continue;
    analysedSymbols += 1;

    let symbolEntryNow = 0;
    let symbolWait = 0;
    let symbolNoTrade = 0;

    for (let index = WINDOW_BARS - 1; index < symbolPrimary.length; index += 1) {
      const bar = symbolPrimary[index];
      if (bar === undefined) continue;
      const decisionTime = bar.closeTime;

      const primaryWindow = symbolPrimary.slice(0, index + 1).slice(-WINDOW_BARS);
      const trendWindow = symbolTrend
        .filter((kline) => kline.closeTime <= decisionTime)
        .slice(-WINDOW_BARS);

      const primary = buildIntervalMetrics(INTERVALS.primary, primaryWindow);
      const trend = buildIntervalMetrics(INTERVALS.trend, trendWindow);
      if (primary === null || trend === null) continue;

      const supportResistance = detectSupportResistance(primaryWindow);
      if (supportResistance === null) continue;

      const coarsePass =
        trend.ema9 > trend.ema21 &&
        trend.ema21 > trend.ema55 &&
        trend.ema21Slope > 0 &&
        trend.ema55Slope > 0 &&
        primary.rsi14 >= SCAN_CONFIG.rsiIdealMin &&
        primary.rsi14 <= SCAN_CONFIG.rsiIdealMax &&
        Math.abs(primary.distanceFromEma21Atr) <= SCAN_CONFIG.maxDistanceFromEma21Atr;

      if (!coarsePass) {
        totals.noTrade += 1;
        symbolNoTrade += 1;
        continue;
      }

      const tickerWindow = symbolPrimary.slice(index - (FORWARD_BARS_24H - 1), index + 1);
      const ticker = synthesiseTicker(symbol, tickerWindow);
      if (ticker === null) continue;

      const quoteVolume24h = ticker.quoteVolume;
      if (quoteVolume24h < SCAN_CONFIG.minQuoteVolume24h) {
        totals.thinVolumeSkips += 1;
        continue;
      }

      const btc = btcContextAt(
        btcTrend,
        decisionTime,
        symbol === BTC_SYMBOL ? trend : null,
      );
      const regime = assessMarketRegime({
        metrics1h: btc.metrics1h,
        metrics15m: null,
        btcDropPct1h: btc.dropPct1h,
      });

      const gate = evaluateRiskGate({
        metrics15m: primary,
        ticker,
        book: null,
        quoteVolume24h,
        spreadPct: ASSUMED_SPREAD_PCT,
        btcDropPct1h: btc.dropPct1h,
        marketRegime: regime.regime,
        dataTimestamp: decisionTime,
        now: decisionTime,
        klinesAvailable: true,
        providerErrors: [],
      });

      const pattern: PatternDetection = bestPattern(detectPatterns(trend, primary));
      const breakdown = scoreCandidate({
        trend,
        primary,
        pattern,
        ticker24h: ticker,
        quoteVolume24h,
        spreadPct: ASSUMED_SPREAD_PCT,
        supportResistance,
        marketRegimePoints: regime.points,
        lastCandleMovePct: bar.open > 0 ? ((bar.close - bar.open) / bar.open) * 100 : 0,
      });

      let status: ScanStatus = "NO_TRADE";
      if (!gate.passed) {
        status = "NO_TRADE";
      } else if (breakdown.total >= SCAN_CONFIG.entryScore) {
        status = "ENTRY_NOW";
      } else if (breakdown.total >= SCAN_CONFIG.watchScore) {
        status = "WAIT_PULLBACK";
      }

      if (status === "ENTRY_NOW") {
        totals.entryNow += 1;
        symbolEntryNow += 1;
      } else if (status === "WAIT_PULLBACK") {
        totals.waitPullback += 1;
        symbolWait += 1;
      } else {
        totals.noTrade += 1;
        symbolNoTrade += 1;
      }

      if (status !== "ENTRY_NOW") continue;

      const referencePrice = primary.close;
      if (!(referencePrice > 0)) continue;

      const future = symbolPrimary.slice(index + 1, index + 1 + FORWARD_BARS_24H);
      if (future.length < FORWARD_BARS_24H) {
        forward.skipped += 1;
      } else {
        let peak = Number.NEGATIVE_INFINITY;
        let trough = Number.POSITIVE_INFINITY;
        for (const kline of future) {
          if (kline.high > peak) peak = kline.high;
          if (kline.low < trough) trough = kline.low;
        }
        const finalClose = future.at(FORWARD_BARS_24H - 1)?.close;
        forward.eligible += 1;
        forward.mfe.push((peak / referencePrice - 1) * 100);
        forward.mae.push((trough / referencePrice - 1) * 100);
        if (peak >= referencePrice * (1 + SCAN_CONFIG.targetPct / 100)) forward.hits += 1;
        if (finalClose !== undefined) {
          forward.return24h.push((finalClose / referencePrice - 1) * 100);
        }
      }

      const close1h = future.at(FORWARD_BARS_1H - 1)?.close;
      if (close1h !== undefined) forward.return1h.push((close1h / referencePrice - 1) * 100);
      const close6h = future.at(FORWARD_BARS_6H - 1)?.close;
      if (close6h !== undefined) forward.return6h.push((close6h / referencePrice - 1) * 100);
    }

    stamp(
      `${symbol} signals`,
      `${symbolEntryNow + symbolWait + symbolNoTrade} (entry ${symbolEntryNow}, watch ${symbolWait})`,
    );
  }

  const totalSignals = totals.entryNow + totals.waitPullback + totals.noTrade;
  const hitRate = forward.eligible === 0 ? null : (forward.hits / forward.eligible) * 100;

  console.log("");
  console.log("=== 3. results ===");
  stamp("Symbols analysed", analysedSymbols);
  stamp("Total Signals", totalSignals);
  stamp("ENTRY_NOW Count", totals.entryNow);
  stamp("WAIT_PULLBACK Count", totals.waitPullback);
  stamp("NO_TRADE Count", totals.noTrade);
  stamp("No Trade Ratio", totalSignals === 0 ? "n/a" : `${((totals.noTrade / totalSignals) * 100).toFixed(1)}%`);
  stamp("Thin-volume bars skipped", totals.thinVolumeSkips);
  stamp("Forward window incomplete", forward.skipped);
  stamp("+5% Hit Rate Within 24h", withSample(hitRate === null ? "n/a" : `${hitRate.toFixed(1)}%`, forward.eligible));
  stamp("Median MFE (24h)", withSample(percent(median(forward.mfe)), forward.mfe.length));
  stamp("Median MAE (24h)", withSample(percent(median(forward.mae)), forward.mae.length));
  stamp("Average Return 1h", withSample(percent(average(forward.return1h)), forward.return1h.length));
  stamp("Average Return 6h", withSample(percent(average(forward.return6h)), forward.return6h.length));
  stamp("Average Return 24h", withSample(percent(average(forward.return24h)), forward.return24h.length));
  stamp("Failed symbols", failedSymbols.length);

  console.log(`\nBACKTEST COMPLETE in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

try {
  await main();
} catch (error) {
  console.error("\nBACKTEST FAILED");
  console.error(`  ${describeBinanceError(error, "backtest")}`);
  process.exitCode = 1;
}
