/**
 * The scan orchestrator: drives the funnel from raw Binance market data down to
 * a single Chinese-language decision.
 *
 * Ordering rules that must not drift:
 * - The risk gate always wins over the score, so a blocked candidate can never
 *   be shown as `ENTRY_NOW`.
 * - `ENTRY_NOW` needs `score >= 78`; the 70–78 band is a watchlist entry only.
 * - Freshness is enforced twice: once inside the gate, and once here as a
 *   belt-and-braces demotion when the payload is older than the freshness window.
 *
 * Everything is read-only market data. No API keys, no account state, no orders.
 */

import { INTERVALS, SCAN_CONFIG, STRATEGY_VERSION } from "@/config/strategy";
import type { BinanceMarketClient } from "@/lib/binance";
import { BinanceError, describeBinanceError, isBinanceError } from "@/lib/binance";
import { buildIntervalMetrics } from "@/lib/indicators/metrics";
import type {
  BookTicker,
  CandidateMetrics,
  Interval,
  IntervalMetrics,
  Kline,
  ScanDiagnostics,
  ScanPayload,
  ScanResult,
  ScanStatus,
  Ticker24h,
  TradePlan,
} from "@/shared/types";
import type { LiquidityCandidate } from "./liquidity";
import { buildLiquidityCandidates, selectTechnicalScanSet } from "./liquidity";
import { assessMarketRegime } from "./market-regime";
import type { MarketRegimeAssessment } from "./market-regime";
import { bestPattern, detectPatterns } from "./patterns";
import { evaluateRiskGate } from "./risk-gate";
import { scoreCandidate } from "./scoring";
import { detectSupportResistance } from "./support-resistance";
import { buildUniverse } from "./universe";

/** Concurrency for the candidate-level kline fan-out, kept clear of the client cap. */
const KLINE_CONCURRENCY = 6;
/** Klines per interval per symbol; matches the configured scorer lookback. */
const KLINE_LIMIT = SCAN_CONFIG.klineLimit;
/** Chinese copy for a scan that produced no tradable candidate at all. */
const NO_CANDIDATE_REASON = "本次扫描没有找到同时满足流动性与形态条件的标的";

/**
 * Chinese copy for the case where the volume floor alone emptied the funnel.
 *
 * Worth its own message: the generic "no candidate" wording reads like a quiet
 * market, but an empty liquidity stage is usually the venue's fault — a mirror
 * that lists fewer, thinner pairs — and the user cannot tell the two apart
 * without being told. The floor itself is never lowered to manufacture a result.
 */
function emptyFunnelReason(universeCount: number, liquidityCount: number, spreadCount: number): string {
  if (universeCount > 0 && liquidityCount === 0) {
    return `本次扫描没有标的达到 ${SCAN_CONFIG.minQuoteVolume24h / 1_000_000}M USDT 的 24 小时成交额下限`;
  }
  if (liquidityCount > 0 && spreadCount === 0) {
    return `本次扫描的标的买卖价差都超过 ${SCAN_CONFIG.maxSpreadPct}% 上限，滑点风险过高`;
  }
  return NO_CANDIDATE_REASON;
}
/** Chinese copy for the second freshness check performed after scoring. */
const STALE_DEMOTION_REASON = "数据超过 5 分钟未更新，先等待回踩确认";

/** Human-readable Chinese text for the machine-readable gate warnings. */
const WARNING_LABELS: Readonly<Record<string, string>> = {
  DATA_STALE: "数据超过 5 分钟未更新",
  BTC_RISK_OFF: "BTC 处于风险规避状态",
  EXTENDED_FROM_EMA21: "价格偏离 EMA21 较远",
  THIN_LIQUIDITY: "流动性偏薄",
  NEWS_UNAVAILABLE: "新闻面数据不可用",
};

/** A candidate that cleared every filter, with its metrics already computed. */
interface EvaluatedCandidate {
  candidate: LiquidityCandidate;
  ticker: Ticker24h;
  metrics15m: CandidateMetrics;
  lastCandleMovePct: number;
  score: number;
  status: ScanStatus;
  reasons: string[];
  risks: string[];
  plan: TradePlan;
  evaluatedAt: number;
}

function warningLabel(code: string): string {
  return WARNING_LABELS[code] ?? code;
}

/** Deduplicates while preserving first-seen order. */
function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Runs `worker` over `items` with a bounded number of in-flight promises.
 *
 * The client's own pool helper is private and capped lower than we need, so the
 * fan-out is kept local and deliberately small.
 */
async function mapWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  limit: number,
  worker: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = new Array<TResult>(items.length);
  let nextIndex = 0;

  async function run(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }

  const runners: Promise<void>[] = [];
  const runnerCount = Math.max(1, Math.min(limit, items.length));
  for (let index = 0; index < runnerCount; index += 1) {
    runners.push(run());
  }
  await Promise.all(runners);
  return results;
}

/** The single-candle body move of the newest candle, in percent. */
function lastCandleMovePct(klines: readonly Kline[]): number {
  const last = klines[klines.length - 1];
  if (!last || !Number.isFinite(last.open) || last.open <= 0) return 0;
  return ((last.close - last.open) / last.open) * 100;
}

/** BTC's change over the most recent hour, sign-flipped so a drop is positive. */
function btcDropPct1h(klines: readonly Kline[]): number | null {
  const last = klines[klines.length - 1];
  const previous = klines[klines.length - 2];
  if (!last || !previous) return null;
  if (!Number.isFinite(previous.close) || previous.close <= 0) return null;
  return ((previous.close - last.close) / previous.close) * 100;
}

function buildMetrics(
  primary: { rsi14: number; volumeRatio: number; atrPct: number },
  trend: { rsi14: number },
  spread: number,
): CandidateMetrics {
  return {
    rsi15m: primary.rsi14,
    rsi1h: trend.rsi14,
    volumeRatio: primary.volumeRatio,
    spreadPct: spread,
    atrPct: primary.atrPct,
  };
}

/** Fetch metrics for one interval, discarding null snapshots. */
async function metricsFor(
  client: BinanceMarketClient,
  symbol: string,
  interval: Interval,
): Promise<IntervalMetrics | null> {
  const klines = await client.klines(symbol, interval, KLINE_LIMIT);
  return buildIntervalMetrics(interval, klines);
}

/**
 * Fetches the 15m and 1h snapshots for every shortlisted symbol.
 *
 * A symbol that fails or returns an unusable series is dropped rather than
 * aborting the scan; the failure is recorded so `/debug` can show it.
 */
async function fetchTechnicalStage(
  client: BinanceMarketClient,
  shortlist: readonly LiquidityCandidate[],
  providerErrors: string[],
): Promise<Array<{ candidate: LiquidityCandidate; trend: IntervalMetrics; primary: IntervalMetrics }>> {
  const settled = await mapWithConcurrency(shortlist, KLINE_CONCURRENCY, async (candidate) => {
    try {
      const [trend, primary] = await Promise.all([
        metricsFor(client, candidate.symbol, INTERVALS.trend),
        metricsFor(client, candidate.symbol, INTERVALS.primary),
      ]);
      return { candidate, trend, primary };
    } catch (error: unknown) {
      providerErrors.push(`${candidate.symbol}: ${describeBinanceError(error)}`);
      return null;
    }
  });

  const stage: Array<{ candidate: LiquidityCandidate; trend: IntervalMetrics; primary: IntervalMetrics }> = [];
  for (const entry of settled) {
    if (!entry || entry.trend === null || entry.primary === null) continue;
    stage.push({ candidate: entry.candidate, trend: entry.trend, primary: entry.primary });
  }
  return stage;
}

/** The coarse screen: EMA stack, both slopes up, RSI window, not over-extended. */
function passesCoarseScreen(entry: {
  trend: { ema9: number; ema21: number; ema55: number; ema21Slope: number; ema55Slope: number };
  primary: { rsi14: number; distanceFromEma21Atr: number };
}): boolean {
  const { trend, primary } = entry;
  if (!(trend.ema9 > trend.ema21 && trend.ema21 > trend.ema55)) return false;
  if (!(trend.ema21Slope > 0 && trend.ema55Slope > 0)) return false;
  if (primary.rsi14 < SCAN_CONFIG.rsiIdealMin || primary.rsi14 > SCAN_CONFIG.rsiIdealMax) return false;
  if (Math.abs(primary.distanceFromEma21Atr) > SCAN_CONFIG.maxDistanceFromEma21Atr) return false;
  return true;
}

/**
 * Runs one full scan against the public market-data endpoints.
 *
 * Global failures (universe, whole-market tickers, BTC context) throw so the
 * caller can surface `DATA_UNAVAILABLE`. Per-symbol failures never throw: they
 * shrink the funnel and are reported in `diagnostics.providerErrors`.
 */
export async function runScan(client: BinanceMarketClient): Promise<ScanPayload> {
  const now = Date.now();
  const providerErrors: string[] = [];

  let universeCount = 0;
  let liquidityFilterCount = 0;
  let technicalScanCount = 0;
  let deepScanCount = 0;

  try {
    const [exchangeSymbols, allTickers, btc1h, btc15m] = await Promise.all([
      client.exchangeInfo(),
      client.ticker24h(),
      client.klines("BTCUSDT", INTERVALS.trend, KLINE_LIMIT),
      client.klines("BTCUSDT", INTERVALS.primary, KLINE_LIMIT),
    ]);

    const universeList = buildUniverse(exchangeSymbols);
    const universe = universeList.map((symbol) => symbol.symbol);
    universeCount = universeList.length;
    const tickerBySymbol = new Map<string, Ticker24h>();
    for (const ticker of allTickers) tickerBySymbol.set(ticker.symbol, ticker);

    const [tickers, books] = await Promise.all([
      client.ticker24h(universe),
      client.bookTicker(universe),
    ]);
    const bookBySymbol = new Map<string, BookTicker>();
    for (const book of books) bookBySymbol.set(book.symbol, book);

    const liquidityCandidates = buildLiquidityCandidates(tickers, books);
    liquidityFilterCount = liquidityCandidates.length;
    const shortlist = selectTechnicalScanSet(liquidityCandidates);
    technicalScanCount = shortlist.length;

    const technicalStage = await fetchTechnicalStage(client, shortlist, providerErrors);

    const coarse = technicalStage
      .filter((entry) => passesCoarseScreen(entry))
      .sort((left, right) => {
        const byVolume = right.candidate.quoteVolume24h - left.candidate.quoteVolume24h;
        if (byVolume !== 0) return byVolume;
        return left.candidate.symbol.localeCompare(right.candidate.symbol);
      })
      .slice(0, SCAN_CONFIG.deepScanSize);

    const metrics1h = buildIntervalMetrics(INTERVALS.trend, btc1h);
    const metrics15m = buildIntervalMetrics(INTERVALS.primary, btc15m);
    const btcDrop = btcDropPct1h(btc1h);
    const regime: MarketRegimeAssessment = assessMarketRegime({
      metrics1h,
      metrics15m,
      btcDropPct1h: btcDrop,
    });

    const evaluated = await mapWithConcurrency(coarse, KLINE_CONCURRENCY, async (entry) => {
      const { candidate, trend, primary } = entry;
      try {
        const ticker = tickerBySymbol.get(candidate.symbol);
        if (!ticker) {
          providerErrors.push(`${candidate.symbol}: 缺少 24 小时行情数据`);
          return null;
        }
        const book = bookBySymbol.get(candidate.symbol) ?? null;
        const [micro, macro] = await Promise.all([
          client.klines(candidate.symbol, INTERVALS.confirmation, KLINE_LIMIT),
          client.klines(candidate.symbol, INTERVALS.macro, KLINE_LIMIT),
        ]);
        void micro;
        void macro;

        const primaryKlines = await client.klines(candidate.symbol, INTERVALS.primary, KLINE_LIMIT);
        const supportResistance = detectSupportResistance(primaryKlines);
        if (supportResistance === null) return null;

        const spread = candidate.spreadPct;
        if (spread === null || !Number.isFinite(spread)) return null;

        const pattern = bestPattern(detectPatterns(trend, primary));
        const move = lastCandleMovePct(primaryKlines);
        const breakdown = scoreCandidate({
          trend,
          primary,
          pattern,
          ticker24h: ticker,
          quoteVolume24h: candidate.quoteVolume24h,
          spreadPct: spread,
          supportResistance,
          marketRegimePoints: regime.points,
          lastCandleMovePct: move,
        });
        const gate = evaluateRiskGate({
          metrics15m: primary,
          ticker,
          book,
          quoteVolume24h: candidate.quoteVolume24h,
          spreadPct: spread,
          btcDropPct1h: btcDrop,
          marketRegime: regime.regime,
          dataTimestamp: primaryKlines[primaryKlines.length - 1]?.closeTime ?? now,
          now,
          klinesAvailable: true,
          providerErrors: [],
        });

        let status: ScanStatus = "NO_TRADE";
        const reasons: string[] = [];
        if (!gate.passed) {
          status = "NO_TRADE";
          reasons.push(...gate.reasons);
        } else if (breakdown.total >= SCAN_CONFIG.entryScore) {
          status = "ENTRY_NOW";
        } else if (breakdown.total >= SCAN_CONFIG.watchScore) {
          status = "WAIT_PULLBACK";
        } else {
          status = "NO_TRADE";
        }
        reasons.push(pattern.label);

        const risks = unique([...gate.warnings.map(warningLabel), ...regime.reasons]);
        const referencePrice = primary.close;
        const plan: TradePlan = {
          referencePrice,
          target5Pct: referencePrice * (1 + SCAN_CONFIG.targetPct / 100),
          invalidation: supportResistance.support,
        };

        return {
          candidate,
          ticker,
          metrics15m: buildMetrics(primary, trend, spread),
          lastCandleMovePct: move,
          score: breakdown.total,
          status,
          reasons,
          risks,
          plan,
          evaluatedAt: primaryKlines[primaryKlines.length - 1]?.closeTime ?? now,
        } satisfies EvaluatedCandidate;
      } catch (error: unknown) {
        providerErrors.push(`${candidate.symbol}: ${describeBinanceError(error)}`);
        return null;
      }
    });

    deepScanCount = coarse.length;

    const ranked = evaluated
      .filter((entry): entry is EvaluatedCandidate => entry !== null)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.candidate.symbol.localeCompare(right.candidate.symbol);
      });

    const top = ranked[0] ?? null;
    const diagnostics: ScanDiagnostics = {
      universeCount,
      liquidityFilterCount,
      technicalScanCount,
      deepScanCount,
      candidateCount: ranked.length,
      topCandidate: top?.candidate.symbol ?? null,
      topScore: top?.score ?? null,
      scanDurationMs: Date.now() - now,
      dataTimestamp: top?.evaluatedAt ?? Date.now(),
      providerErrors: unique(providerErrors),
    };

    if (top === null) {
      return {
        result: {
          status: "NO_TRADE",
          symbol: null,
          baseAsset: null,
          price: null,
          score: 0,
          targetPct: SCAN_CONFIG.targetPct,
          marketRegime: regime.regime,
          reasons: [emptyFunnelReason(universeCount, liquidityFilterCount, technicalScanCount)],
          risks: unique(regime.reasons),
          metrics: null,
          plan: null,
          generatedAt: new Date(now).toISOString(),
          strategyVersion: STRATEGY_VERSION,
        },
        diagnostics,
        cached: false,
      };
    }

    // Belt-and-braces freshness demotion: the gate already vetoes stale data, but
    // a cached or slow scan must never advertise a fresh entry on old candles.
    const dataTimestamp = top.evaluatedAt;
    let status = top.status;
    const reasons = [...top.reasons];
    if (status === "ENTRY_NOW" && now - dataTimestamp > SCAN_CONFIG.dataFreshnessMs) {
      status = "WAIT_PULLBACK";
      reasons.push(STALE_DEMOTION_REASON);
    }

    const baseAsset = top.candidate.symbol.replace(/USDT$/, "");
    const result: ScanResult = {
      status,
      symbol: top.candidate.symbol,
      baseAsset,
      price: top.plan.referencePrice,
      score: top.score,
      targetPct: SCAN_CONFIG.targetPct,
      marketRegime: regime.regime,
      reasons: unique(reasons),
      risks: unique(top.risks),
      metrics: top.metrics15m,
      plan: top.plan,
      generatedAt: new Date(now).toISOString(),
      strategyVersion: STRATEGY_VERSION,
    };

    return { result, diagnostics, cached: false };
  } catch (error: unknown) {
    if (isBinanceError(error)) throw error;
    throw new BinanceError(describeBinanceError(error), {
      code: "DATA_UNAVAILABLE",
      endpoint: "runScan",
      cause: error,
    });
  }
}
