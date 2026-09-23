/**
 * Full-universe walk-forward backtest.
 *
 * The replay rebuilds a liquidity snapshot at every historical decision time,
 * ranks the current USDT universe by trailing 24h quote volume, runs the same
 * technical/deep-scan strategy on that snapshot, and measures the future path
 * of the final Top 1. No partial candle and no future candle enters a decision.
 *
 * Historical exchangeInfo is not published by Binance, so the current
 * tradable USDT universe is the closest auditable approximation. Symbols that
 * had no candles at a decision time are naturally excluded from that snapshot.
 */

import { INTERVALS, SCAN_CONFIG } from "../src/config/strategy";
import { createBinanceMarketClient, describeBinanceError } from "../src/lib/binance/index";
import type { BinanceMarketClient } from "../src/lib/binance/index";
import { buildIntervalMetrics } from "../src/lib/indicators/metrics";
import { assessMacro, assessTrigger } from "../src/strategy/four-timeframe";
import { liquidityPoints } from "../src/strategy/liquidity";
import { assessMarketRegime } from "../src/strategy/market-regime";
import { bestPattern, detectPatterns } from "../src/strategy/patterns";
import { confidenceFromRanking } from "../src/strategy/opportunity-score";
import { evaluateRiskGate } from "../src/strategy/risk-gate";
import { relativeStrength } from "../src/strategy/relative-strength";
import { scoreCandidate } from "../src/strategy/scoring";
import { detectSupportResistance } from "../src/strategy/support-resistance";
import { buildUniverse } from "../src/strategy/universe";
import type { IntervalMetrics, Kline, ScanStatus, Ticker24h } from "../src/shared/types";
import type { LiquidityCandidate } from "../src/strategy/liquidity";

const DEFAULT_DAYS = 7;
const BTC_SYMBOL = "BTCUSDT";
const WINDOW_BARS = 200;
const SNAPSHOT_INTERVAL_BARS = 16;
const FORWARD_BARS_1H = 4;
const FORWARD_BARS_6H = 24;
const FORWARD_BARS_24H = 96;
const ASSUMED_SPREAD_PCT = 0.1;
const PAGE_LIMIT = 1000;
const FETCH_CONCURRENCY = 5;
const STATUS_PRIORITY: Record<ScanStatus, number> = {
  BUY_NOW: 3,
  BUY_ON_PULLBACK: 2,
  WATCH_ONLY: 1,
  MARKET_HALT: 0,
};

interface ForwardStats {
  eligible: number;
  incomplete: number;
  hit3Pct: number;
  hit5Pct: number;
  mfe: number[];
  mae: number[];
  return1h: number[];
  return6h: number[];
  return24h: number[];
}

interface SnapshotCandidate {
  symbol: string;
  status: ScanStatus;
  absoluteScore: number;
  opportunityScore: number;
  referencePrice: number;
}

interface Evaluated extends SnapshotCandidate {
  penalty: number;
  triggerQuality: number;
}

interface TechnicalStage {
  candidate: LiquidityCandidate;
  ticker: Ticker24h;
  primaryWindow: Kline[];
  primaryMetrics: IntervalMetrics;
  trendMetrics: IntervalMetrics;
  score: number;
}

interface BacktestResult {
  sampleSize: number;
  attemptedSnapshots: number;
  gateRejections: number;
  missingIntervals: number;
  decisionDistribution: Record<ScanStatus, number>;
  evaluatedStatusDistribution: Record<ScanStatus, number>;
  forward: ForwardStats;
}

function stamp(label: string, value: string | number): void {
  console.log(`${label.padEnd(30)} ${value}`);
}

function parseDays(argv: readonly string[]): number {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--days") return parseNumber(argv[index + 1]);
    if (argv[index]?.startsWith("--days=")) return parseNumber(argv[index]?.slice("--days=".length));
  }
  return DEFAULT_DAYS;
}

function parseNumber(raw: string | undefined): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) ? Math.max(1, Math.min(value, 30)) : DEFAULT_DAYS;
}

async function mapWithConcurrency<TInput, TOutput>(
  values: readonly TInput[],
  concurrency: number,
  worker: (value: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results = new Array<TOutput>(values.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index]!);
    }
  });
  await Promise.all(runners);
  return results;
}

async function fetchSeries(
  client: BinanceMarketClient,
  symbol: string,
  interval: Parameters<BinanceMarketClient["klines"]>[1],
  wanted: number,
): Promise<Kline[]> {
  const byOpenTime = new Map<number, Kline>();
  let endTime: number | undefined;
  const maxPages = Math.ceil(wanted / PAGE_LIMIT) + 2;

  for (let page = 0; page < maxPages; page += 1) {
    const batch = await client.klines(symbol, interval, PAGE_LIMIT, endTime === undefined ? {} : { endTime });
    if (batch.length === 0) break;
    for (const kline of batch) byOpenTime.set(kline.openTime, kline);
    if (byOpenTime.size >= wanted || batch.length < PAGE_LIMIT) break;
    const oldest = batch[0];
    if (!oldest) break;
    endTime = oldest.openTime - 1;
  }

  return [...byOpenTime.values()]
    .sort((left, right) => left.openTime - right.openTime)
    .slice(-wanted);
}

export function tickerFromKlines(symbol: string, window: readonly Kline[]): Ticker24h | null {
  const first = window[0];
  const last = window.at(-1);
  if (!first || !last) return null;

  let highPrice = Number.NEGATIVE_INFINITY;
  let lowPrice = Number.POSITIVE_INFINITY;
  let volume = 0;
  let quoteVolume = 0;
  let trades = 0;
  for (const kline of window) {
    highPrice = Math.max(highPrice, kline.high);
    lowPrice = Math.min(lowPrice, kline.low);
    volume += kline.volume;
    quoteVolume += kline.quoteVolume;
    trades += kline.trades;
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
    count: trades,
  };
}

export function emptyDistribution(): Record<ScanStatus, number> {
  return { BUY_NOW: 0, BUY_ON_PULLBACK: 0, WATCH_ONLY: 0, MARKET_HALT: 0 };
}

export function emptyForward(): ForwardStats {
  return { eligible: 0, incomplete: 0, hit3Pct: 0, hit5Pct: 0, mfe: [], mae: [], return1h: [], return6h: [], return24h: [] };
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return null;
  return sorted.length % 2 === 1 ? upper : (upper + sorted[middle - 1]!) / 2;
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percent(value: number | null): string {
  return value === null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function withSample(value: string, sampleSize: number): string {
  return sampleSize === 0 ? "n/a" : `${value} (n=${sampleSize})`;
}

function windowAt(series: readonly Kline[], decisionTime: number): Kline[] {
  return series.filter((kline) => kline.closeTime <= decisionTime).slice(-WINDOW_BARS);
}

export function forwardStats(referencePrice: number, future: readonly Kline[], stats: ForwardStats): void {
  if (future.length < FORWARD_BARS_24H) {
    stats.incomplete += 1;
    return;
  }

  let peak = Number.NEGATIVE_INFINITY;
  let trough = Number.POSITIVE_INFINITY;
  for (const kline of future) {
    peak = Math.max(peak, kline.high);
    trough = Math.min(trough, kline.low);
  }

  stats.eligible += 1;
  stats.mfe.push((peak / referencePrice - 1) * 100);
  stats.mae.push((trough / referencePrice - 1) * 100);
  if (peak >= referencePrice * 1.03) stats.hit3Pct += 1;
  if (peak >= referencePrice * 1.05) stats.hit5Pct += 1;

  const close1h = future[FORWARD_BARS_1H - 1]?.close;
  const close6h = future[FORWARD_BARS_6H - 1]?.close;
  const close24h = future[FORWARD_BARS_24H - 1]?.close;
  if (close1h !== undefined) stats.return1h.push((close1h / referencePrice - 1) * 100);
  if (close6h !== undefined) stats.return6h.push((close6h / referencePrice - 1) * 100);
  if (close24h !== undefined) stats.return24h.push((close24h / referencePrice - 1) * 100);
}

async function main(): Promise<BacktestResult> {
  const days = parseDays(process.argv.slice(2));
  const client = createBinanceMarketClient();
  const universeSymbols = buildUniverse(await client.exchangeInfo()).map((symbol) => symbol.symbol);
  const primaryWanted = days * 96 + FORWARD_BARS_24H + WINDOW_BARS;
  const confirmationWanted = days * 288 + WINDOW_BARS;
  const trendWanted = days * 24 + WINDOW_BARS;
  const contextWanted = WINDOW_BARS + days * 6;
  const failedSymbols: string[] = [];

  console.log("=== 1. loading historical universe ===");
  stamp("current universe", universeSymbols.length);
  stamp("window (days)", days);

  const primarySeries = new Map<string, Kline[]>();
  await mapWithConcurrency(universeSymbols, FETCH_CONCURRENCY, async (symbol) => {
    try {
      const primary = await fetchSeries(client, symbol, INTERVALS.primary, primaryWanted);
      if (primary.length >= WINDOW_BARS) primarySeries.set(symbol, primary);
    } catch {
      failedSymbols.push(symbol);
    }
  });
  stamp("15m-ready symbols", primarySeries.size);
  stamp("15m fetch failures", failedSymbols.length);

  const btcPrimary = primarySeries.get(BTC_SYMBOL);
  if (!btcPrimary) throw new Error("BTCUSDT 15m history unavailable");
  const firstDecisionIndex = WINDOW_BARS - 1;
  const lastDecisionIndex = btcPrimary.length - FORWARD_BARS_24H - 1;
  const decisionTimes: number[] = [];
  for (let index = firstDecisionIndex; index <= lastDecisionIndex; index += SNAPSHOT_INTERVAL_BARS) {
    const kline = btcPrimary[index];
    if (kline) decisionTimes.push(kline.closeTime);
  }
  stamp("decision snapshots", decisionTimes.length);

  const top120Symbols = new Set<string>();
  for (const decisionTime of decisionTimes) {
    const ranked: Array<{ symbol: string; quoteVolume: number }> = [];
    for (const [symbol, series] of primarySeries) {
      const index = series.findIndex((kline) => kline.closeTime === decisionTime);
      if (index < 0) continue;
      const ticker = tickerFromKlines(symbol, series.slice(index - 95, index + 1));
      if (ticker && ticker.quoteVolume >= SCAN_CONFIG.minQuoteVolume24h) {
        ranked.push({ symbol, quoteVolume: ticker.quoteVolume });
      }
    }
    ranked.sort((left, right) => right.quoteVolume - left.quoteVolume);
    for (const entry of ranked.slice(0, SCAN_CONFIG.universeSize)) top120Symbols.add(entry.symbol);
  }
  stamp("symbols ever in Top120", top120Symbols.size);

  console.log("\n=== 2. loading strategy intervals ===");
  const trendSeries = new Map<string, Kline[]>();
  const confirmationSeries = new Map<string, Kline[]>();
  const macroSeries = new Map<string, Kline[]>();
  await mapWithConcurrency([...top120Symbols], FETCH_CONCURRENCY, async (symbol) => {
    try {
      const [trend, confirmation, macro] = await Promise.all([
        fetchSeries(client, symbol, INTERVALS.trend, trendWanted),
        fetchSeries(client, symbol, INTERVALS.confirmation, confirmationWanted),
        fetchSeries(client, symbol, INTERVALS.macro, contextWanted),
      ]);
      if (trend.length >= WINDOW_BARS) trendSeries.set(symbol, trend);
      if (confirmation.length >= WINDOW_BARS) confirmationSeries.set(symbol, confirmation);
      if (macro.length >= 60) macroSeries.set(symbol, macro);
    } catch {
      failedSymbols.push(symbol);
    }
  });
  stamp("1h-ready symbols", trendSeries.size);
  stamp("5m-ready symbols", confirmationSeries.size);
  stamp("4h-ready symbols", macroSeries.size);

  const btcTrend = trendSeries.get(BTC_SYMBOL);
  if (!btcTrend) throw new Error("BTCUSDT 1h history unavailable");

  const decisionDistribution = emptyDistribution();
  const evaluatedStatusDistribution = emptyDistribution();
  const forward = emptyForward();
  let completedSnapshots = 0;
  let attemptedSnapshots = 0;
  let gateRejections = 0;
  let missingIntervals = 0;

  console.log("\n=== 3. replaying walk-forward snapshots ===");
  for (const [snapshotIndex, decisionTime] of decisionTimes.entries()) {
    const btcTrendWindow = windowAt(btcTrend, decisionTime);
    const btcPrimaryWindow = windowAt(btcPrimary, decisionTime);
    const btcTrendMetrics = buildIntervalMetrics(INTERVALS.trend, btcTrendWindow);
    const btcPrimaryMetrics = buildIntervalMetrics(INTERVALS.primary, btcPrimaryWindow);
    if (!btcTrendMetrics || !btcPrimaryMetrics) continue;

    const btcLast = btcTrendWindow.at(-1);
    const btcPrevious = btcTrendWindow.at(-2);
    const btcDrop = btcLast && btcPrevious?.close
      ? (btcPrevious.close - btcLast.close) / btcPrevious.close * 100
      : null;
    const regime = assessMarketRegime({
      metrics1h: btcTrendMetrics,
      metrics15m: btcPrimaryMetrics,
      btcDropPct1h: btcDrop,
    });

    const liquidityCandidates: LiquidityCandidate[] = [];
    for (const symbol of top120Symbols) {
      const primaryFull = primarySeries.get(symbol);
      if (!primaryFull) continue;
      const index = primaryFull.findIndex((kline) => kline.closeTime === decisionTime);
      if (index < 0) continue;
      const ticker = tickerFromKlines(symbol, primaryFull.slice(index - 95, index + 1));
      if (!ticker || ticker.quoteVolume < SCAN_CONFIG.minQuoteVolume24h) continue;
      liquidityCandidates.push({
        symbol,
        quoteVolume24h: ticker.quoteVolume,
        lastPrice: ticker.lastPrice,
        priceChangePercent: ticker.priceChangePercent,
        highPrice: ticker.highPrice,
        lowPrice: ticker.lowPrice,
        spreadPct: ASSUMED_SPREAD_PCT,
        spreadVerdict: "PREFERRED",
        liquidityPoints: liquidityPoints(ticker.quoteVolume),
      });
    }
    liquidityCandidates.sort((left, right) => right.quoteVolume24h - left.quoteVolume24h);
    const top120 = liquidityCandidates.slice(0, SCAN_CONFIG.universeSize);

    const technical: TechnicalStage[] = [];
    for (const candidate of top120) {
      const primaryFull = primarySeries.get(candidate.symbol);
      const trendFull = trendSeries.get(candidate.symbol);
      if (!primaryFull || !trendFull) continue;
      const index = primaryFull.findIndex((kline) => kline.closeTime === decisionTime);
      if (index < 0) continue;
      const primaryWindow = primaryFull.slice(Math.max(0, index - WINDOW_BARS + 1), index + 1);
      const trendWindow = windowAt(trendFull, decisionTime);
      const primaryMetrics = buildIntervalMetrics(INTERVALS.primary, primaryWindow);
      const trendMetrics = buildIntervalMetrics(INTERVALS.trend, trendWindow);
      const ticker = tickerFromKlines(candidate.symbol, primaryWindow.slice(-96));
      if (!primaryMetrics || !trendMetrics || !ticker) continue;

      const supportResistance = detectSupportResistance(primaryWindow);
      if (!supportResistance) continue;
      const breakdown = scoreCandidate({
        trend: trendMetrics,
        primary: primaryMetrics,
        pattern: bestPattern(detectPatterns(trendMetrics, primaryMetrics)),
        ticker24h: ticker,
        quoteVolume24h: candidate.quoteVolume24h,
        spreadPct: ASSUMED_SPREAD_PCT,
        supportResistance,
        marketRegimePoints: regime.points,
        lastCandleMovePct: primaryWindow.length > 1 && primaryWindow.at(-2)!.close > 0
          ? (primaryWindow.at(-1)!.close / primaryWindow.at(-2)!.close - 1) * 100
          : 0,
      });
      technical.push({ candidate, ticker, primaryWindow, primaryMetrics, trendMetrics, score: breakdown.total });
    }

    technical.sort((left, right) => right.score - left.score || left.candidate.symbol.localeCompare(right.candidate.symbol));
    const deepSet = technical.slice(0, SCAN_CONFIG.deepScanSize);
    if (deepSet.length > 0) attemptedSnapshots += 1;
    const peerInputs = technical.map((entry) => ({
      metrics15m: entry.primaryMetrics,
      metrics1h: entry.trendMetrics,
      change24h: entry.ticker.priceChangePercent,
      volumeRatio24h: entry.primaryMetrics.volumeRatio,
      universeCount: top120.length,
    }));

    const evaluated: Evaluated[] = [];
    for (const entry of deepSet) {
      const confirmationFull = confirmationSeries.get(entry.candidate.symbol);
      const macroFull = macroSeries.get(entry.candidate.symbol);
      if (!confirmationFull || !macroFull) {
        missingIntervals += 1;
        continue;
      }
      const triggerMetrics = buildIntervalMetrics(INTERVALS.confirmation, windowAt(confirmationFull, decisionTime));
      const macroMetrics = buildIntervalMetrics(INTERVALS.macro, windowAt(macroFull, decisionTime));
      if (!triggerMetrics || !macroMetrics) continue;

      const gate = evaluateRiskGate({
        metrics15m: entry.primaryMetrics,
        ticker: entry.ticker,
        quoteVolume24h: entry.candidate.quoteVolume24h,
        spreadPct: ASSUMED_SPREAD_PCT,
        btcDropPct1h: btcDrop,
        marketRegime: regime.regime,
        dataTimestamp: decisionTime,
        now: decisionTime,
        klinesAvailable: true,
        providerErrors: [],
      });
      if (!gate.passed) {
        gateRejections += 1;
        continue;
      }

      const trigger = assessTrigger(triggerMetrics);
      const macro = assessMacro(macroMetrics);
      const supportResistance = detectSupportResistance(entry.primaryWindow);
      if (!supportResistance) continue;
      const breakdown = scoreCandidate({
        trend: entry.trendMetrics,
        primary: entry.primaryMetrics,
        pattern: bestPattern(detectPatterns(entry.trendMetrics, entry.primaryMetrics)),
        ticker24h: entry.ticker,
        quoteVolume24h: entry.candidate.quoteVolume24h,
        spreadPct: ASSUMED_SPREAD_PCT,
        supportResistance,
        marketRegimePoints: regime.points,
        lastCandleMovePct: entry.primaryWindow.length > 1 && entry.primaryWindow.at(-2)!.close > 0
          ? (entry.primaryWindow.at(-1)!.close / entry.primaryWindow.at(-2)!.close - 1) * 100
          : 0,
      });
      const distanceAtr = Math.abs(entry.primaryMetrics.distanceFromEma21Atr);
      const stretchPenalty = distanceAtr > 1.2 ? Math.min(15, (distanceAtr - 1.2) * 12) : 0;
      const softPenalty = Math.max(0, breakdown.penalty + stretchPenalty + (macro.quality < 45 ? 8 : 0));
      const relative = relativeStrength({
        metrics15m: entry.primaryMetrics,
        metrics1h: entry.trendMetrics,
        change24h: entry.ticker.priceChangePercent,
        volumeRatio24h: entry.primaryMetrics.volumeRatio,
        universeCount: top120.length,
      }, peerInputs);
      const scored = confidenceFromRanking({
        absolute: breakdown,
        relativeStrength: relative.score,
        liquidityQuality: entry.candidate.liquidityPoints * 10,
        triggerQuality: trigger.quality,
        softRiskPenalty: softPenalty,
      }, null);

      let status: ScanStatus = "WATCH_ONLY";
      if (scored.opportunityScore >= SCAN_CONFIG.buyNowScore && trigger.confirmed && distanceAtr <= 1.2) status = "BUY_NOW";
      else if (scored.opportunityScore >= SCAN_CONFIG.pullbackScore) status = "BUY_ON_PULLBACK";
      evaluatedStatusDistribution[status] += 1;
      evaluated.push({
        symbol: entry.candidate.symbol,
        status,
        absoluteScore: scored.absoluteScore,
        opportunityScore: scored.opportunityScore,
        referencePrice: entry.primaryMetrics.close,
        penalty: softPenalty,
        triggerQuality: trigger.quality,
      });
    }

    const ranked = [...evaluated].sort((left, right) => right.opportunityScore - left.opportunityScore || left.symbol.localeCompare(right.symbol));
    const top = [...ranked].sort((left, right) => STATUS_PRIORITY[right.status] - STATUS_PRIORITY[left.status] || right.opportunityScore - left.opportunityScore || left.symbol.localeCompare(right.symbol))[0];
    if (!top) continue;

    confidenceFromRanking({
      absolute: { trend: 0, momentum: 0, volume: 0, entry: 0, liquidity: 0, riskReward: 0, market: 0, penalty: top.penalty, total: top.absoluteScore },
      relativeStrength: 0,
      liquidityQuality: 0,
      triggerQuality: top.triggerQuality,
      softRiskPenalty: top.penalty,
    }, ranked.find((entry) => entry.symbol !== top.symbol)?.opportunityScore ?? null);
    decisionDistribution[top.status] += 1;
    completedSnapshots += 1;

    const primaryFull = primarySeries.get(top.symbol)!;
    const index = primaryFull.findIndex((kline) => kline.closeTime === decisionTime);
    if (index >= 0) forwardStats(top.referencePrice, primaryFull.slice(index + 1, index + 1 + FORWARD_BARS_24H), forward);
    if ((snapshotIndex + 1) % 10 === 0) stamp("snapshots replayed", snapshotIndex + 1);
  }

  if (completedSnapshots === 0) throw new Error("No snapshot produced a Top 1 candidate");
  return {
    sampleSize: completedSnapshots,
    attemptedSnapshots,
    gateRejections,
    missingIntervals,
    decisionDistribution,
    evaluatedStatusDistribution,
    forward,
  };
}

const isCliRun = process.argv[1]?.endsWith("backtest.ts") ?? false;

if (isCliRun) try {
  const startedAt = Date.now();
  const result = await main();
  stamp("Snapshots with candidates", result.attemptedSnapshots);
  stamp("Risk-gate rejections", result.gateRejections);
  stamp("Missing interval rejections", result.missingIntervals);
  const hit3 = result.forward.eligible === 0 ? null : result.forward.hit3Pct / result.forward.eligible * 100;
  const hit5 = result.forward.eligible === 0 ? null : result.forward.hit5Pct / result.forward.eligible * 100;
  console.log("\n=== V1.1 FULL-UNIVERSE BACKTEST ===");
  stamp("Sample size", result.sampleSize);
  stamp("BUY_NOW Top1", result.decisionDistribution.BUY_NOW);
  stamp("BUY_ON_PULLBACK Top1", result.decisionDistribution.BUY_ON_PULLBACK);
  stamp("WATCH_ONLY Top1", result.decisionDistribution.WATCH_ONLY);
  stamp("MARKET_HALT Top1", result.decisionDistribution.MARKET_HALT);
  stamp("Evaluated BUY_NOW", result.evaluatedStatusDistribution.BUY_NOW);
  stamp("Evaluated BUY_ON_PULLBACK", result.evaluatedStatusDistribution.BUY_ON_PULLBACK);
  stamp("Evaluated WATCH_ONLY", result.evaluatedStatusDistribution.WATCH_ONLY);
  stamp("Top1 +3% Hit Rate", withSample(hit3 === null ? "n/a" : `${hit3.toFixed(1)}%`, result.forward.eligible));
  stamp("Top1 +5% Hit Rate", withSample(hit5 === null ? "n/a" : `${hit5.toFixed(1)}%`, result.forward.eligible));
  stamp("Median MFE", withSample(percent(median(result.forward.mfe)), result.forward.mfe.length));
  stamp("Median MAE", withSample(percent(median(result.forward.mae)), result.forward.mae.length));
  stamp("Average 1h Return", withSample(percent(average(result.forward.return1h)), result.forward.return1h.length));
  stamp("Average 6h Return", withSample(percent(average(result.forward.return6h)), result.forward.return6h.length));
  stamp("Average 24h Return", withSample(percent(average(result.forward.return24h)), result.forward.return24h.length));
  console.log(`\nBACKTEST COMPLETE in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
} catch (error: unknown) {
  console.error("\nBACKTEST FAILED");
  console.error(`  ${describeBinanceError(error, "backtest")}`);
  process.exitCode = 1;
}
