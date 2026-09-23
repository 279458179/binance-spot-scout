/**
 * Ranking-first scan orchestrator.
 *
 * A healthy market always produces a Top 1 candidate. Hard risks remove only
 * unusable names; strategy imperfections lower opportunity score and change
 * whether the result is executable now, executable on a pullback, or watch-only.
 */

import { INTERVALS, REGIME_CONFIG, SCAN_CONFIG, STRATEGY_VERSION } from "@/config/strategy";
import type { BinanceMarketClient } from "@/lib/binance";
import { BinanceError, describeBinanceError, isBinanceError } from "@/lib/binance";
import { filterClosedKlines } from "@/lib/market/candles";
import { buildIntervalMetrics } from "@/lib/indicators/metrics";
import type {
  BookTicker,
  CandidateMetrics,
  DebugCandidate,
  Confidence,
  IntervalMetrics,
  Kline,
  ScanDiagnostics,
  ScanPayload,
  ScanResult,
  ScanStatus,
  Ticker24h,
  TradePlan,
} from "@/shared/types";
import { assessMacro, assessTrigger } from "./four-timeframe";
import type { LiquidityCandidate } from "./liquidity";
import { buildLiquidityCandidates, selectTechnicalScanSet } from "./liquidity";
import { assessMarketRegime } from "./market-regime";
import type { MarketRegimeAssessment } from "./market-regime";
import { bestPattern, detectPatterns } from "./patterns";
import { confidenceFromRanking, opportunityScore } from "./opportunity-score";
import { evaluateRiskGate } from "./risk-gate";
import { relativeStrength } from "./relative-strength";
import { scoreCandidate } from "./scoring";
import { detectSupportResistance } from "./support-resistance";
import { buildUniverse } from "./universe";

const DEBUG_CANDIDATE_LIMIT = 20;
const KLINE_CONCURRENCY = 6;
const KLINE_LIMIT = SCAN_CONFIG.klineLimit;
const STATUS_PRIORITY: Record<ScanStatus, number> = {
  BUY_NOW: 3,
  BUY_ON_PULLBACK: 2,
  WATCH_ONLY: 1,
  MARKET_HALT: 0,
};

interface EvaluatedCandidate {
  candidate: LiquidityCandidate;
  ticker: Ticker24h;
  metrics15m: CandidateMetrics;
  trend1h: IntervalMetrics;
  setup15m: IntervalMetrics;
  macro4h: IntervalMetrics;
  trigger5m: ReturnType<typeof assessTrigger>;
  score: number;
  penalty: number;
  opportunity: number;
  status: ScanStatus;
  reasons: string[];
  risks: string[];
  plan: TradePlan;
  evaluatedAt: number;
  recentKlines: readonly Kline[];
  recentPrices: number[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

async function mapWithConcurrency<TInput, TOutput>(
  values: readonly TInput[],
  concurrency: number,
  worker: (value: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results: TOutput[] = new Array(values.length);
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

function lastCandleMovePct(klines: readonly Kline[]): number {
  const last = klines[klines.length - 1];
  const previous = klines[klines.length - 2];
  if (!last || !previous?.close) return 0;
  return ((last.close - previous.close) / previous.close) * 100;
}

function buildMetrics(
  primary: IntervalMetrics,
  trend: IntervalMetrics,
  spreadPct: number,
): CandidateMetrics {
  return {
    rsi15m: primary.rsi14,
    rsi1h: trend.rsi14,
    volumeRatio: primary.volumeRatio,
    spreadPct,
    atrPct: primary.atrPct,
  };
}

function buildTradePlan(
  price: number,
  metrics: IntervalMetrics,
  support: number,
): TradePlan {
  const atr = Math.max(metrics.atr14, price * 0.0015);
  const nearSupport = Math.min(Math.max(metrics.vwap, support), price * 0.995);
  const zoneLow = Math.min(nearSupport, price - atr * 0.25);
  const zoneHigh = Math.min(price + atr * 0.35, Math.max(zoneLow * 1.005, price + atr * 0.35));
  const entryZoneLow = Math.max(zoneLow, price * 0.985);
  const entryZoneHigh = Math.max(zoneHigh, entryZoneLow * 1.005);
  const pullbackPrice = Math.min(price, (entryZoneLow + entryZoneHigh) / 2);
  const risk = Math.max(price - entryZoneLow, atr * 0.35, price * 0.002);
  return {
    referencePrice: price,
    entryZoneLow,
    entryZoneHigh,
    pullbackPrice,
    target3Pct: price * 1.03,
    target5Pct: price * 1.05,
    invalidation: Math.min(entryZoneLow - atr * 0.5, support),
    riskReward: Number(((price * 1.05 - price) / risk).toFixed(2)),
  };
}

function decisionFrom(
  opportunity: number,
  triggerConfirmed: boolean,
  distanceFromEma21Atr: number,
): ScanStatus {
  if (opportunity >= SCAN_CONFIG.buyNowScore && triggerConfirmed && distanceFromEma21Atr <= 1.2) return "BUY_NOW";
  if (opportunity >= SCAN_CONFIG.pullbackScore) return "BUY_ON_PULLBACK";
  return "WATCH_ONLY";
}

function triggerReasons(trigger: ReturnType<typeof assessTrigger>): string[] {
  return trigger.reasons;
}

function debugFromCandidate(candidate: EvaluatedCandidate): DebugCandidate {
  return {
    symbol: candidate.candidate.symbol,
    quoteVolume24h: candidate.candidate.quoteVolume24h,
    score: candidate.score,
    penalty: candidate.penalty,
    status: candidate.status,
    confidence: "LOW",
    reasons: candidate.reasons,
    rejectReason: null,
  };
}

function toSummary(candidate: EvaluatedCandidate) {
  return {
    symbol: candidate.candidate.symbol,
    status: candidate.status,
    absoluteScore: candidate.score,
    opportunityScore: candidate.opportunity,
    hardRiskPassed: true,
    triggerConfirmed: candidate.trigger5m.confirmed,
  };
}

async function fetchTechnicalStage(
  client: BinanceMarketClient,
  shortlist: readonly LiquidityCandidate[],
  providerErrors: string[],
  now: number,
): Promise<Array<{ candidate: LiquidityCandidate; trend: IntervalMetrics; primary: IntervalMetrics; primaryKlines: Kline[] }>> {
  return mapWithConcurrency(shortlist, KLINE_CONCURRENCY, async (candidate) => {
    try {
      const [trendKlines, primaryKlines] = await Promise.all([
        client.klines(candidate.symbol, INTERVALS.trend, KLINE_LIMIT),
        client.klines(candidate.symbol, INTERVALS.primary, KLINE_LIMIT),
      ]);
      const closedTrend = filterClosedKlines(trendKlines, now);
      const closedPrimary = filterClosedKlines(primaryKlines, now);
      const trend = buildIntervalMetrics(INTERVALS.trend, closedTrend);
      const primary = buildIntervalMetrics(INTERVALS.primary, closedPrimary);
      if (!trend || !primary) return null;
      return { candidate, trend, primary, primaryKlines: closedPrimary };
    } catch (error: unknown) {
      providerErrors.push(`${candidate.symbol}: ${describeBinanceError(error)}`);
      return null;
    }
  }).then((entries) => entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
}

/** Runs one complete scan and returns the persisted payload. */
export async function runScan(client: BinanceMarketClient, now: number = Date.now()): Promise<ScanPayload> {
  const providerErrors: string[] = [];
  let universeCount = 0;
  let liquidityFilterCount = 0;
  let technicalScanCount = 0;
  let deepScanCount = 0;

  try {
    const universe = buildUniverse(await client.exchangeInfo());
    universeCount = universe.length;
    if (universeCount === 0) throw new BinanceError("Binance 现货 Universe 不可用", { code: "DATA_UNAVAILABLE", endpoint: "runScan" });
    const universeSymbols = universe.map((symbol) => symbol.symbol);
    const [tickers, books] = await Promise.all([client.ticker24h(universeSymbols), client.bookTicker(universeSymbols)]);
    const bookBySymbol = new Map<string, BookTicker>();
    for (const book of books) bookBySymbol.set(book.symbol, book);

    const liquidityCandidates = buildLiquidityCandidates(tickers, books);
    liquidityFilterCount = liquidityCandidates.length;
    const shortlist = selectTechnicalScanSet(liquidityCandidates);
    technicalScanCount = shortlist.length;

    const btcSymbol = "BTCUSDT";
    const [btc1hRaw, btc15mRaw] = await Promise.all([
      client.klines(btcSymbol, INTERVALS.trend, KLINE_LIMIT),
      client.klines(btcSymbol, INTERVALS.primary, KLINE_LIMIT),
    ]);
    const btc1h = filterClosedKlines(btc1hRaw, now);
    const btc15m = filterClosedKlines(btc15mRaw, now);
    const btcDrop = (() => {
      const last = btc1h[btc1h.length - 1];
      const previous = btc1h[btc1h.length - 2];
      if (!last || !previous?.close) return null;
      return Math.max(0, ((previous.close - last.close) / previous.close) * 100);
    })();
    const regime = assessMarketRegime({
      metrics1h: buildIntervalMetrics(INTERVALS.trend, btc1h),
      metrics15m: buildIntervalMetrics(INTERVALS.primary, btc15m),
      btcDropPct1h: btcDrop,
    });

    const gateInputBase = {
      btcDropPct1h: btcDrop,
      marketRegime: regime.regime,
      dataTimestamp: btc1h[btc1h.length - 1]?.closeTime ?? now,
      now,
      klinesAvailable: btc1h.length > 0 && btc15m.length > 0,
      providerErrors: [] as string[],
    };
    const btcMetrics15m = buildIntervalMetrics(INTERVALS.primary, btc15m);
    if (!btcMetrics15m) {
      return halted(regime.regime, ["BTC 市场数据不完整"], regime.reasons, now, emptyDiagnostics(now, universeCount));
    }
    if (btcDrop !== null && btcDrop >= REGIME_CONFIG.crashPct1h) {
      return halted(regime.regime, [
        `BTC 近 1 小时下跌 ${btcDrop.toFixed(1)}%，触发系统性停扫`,
      ], regime.reasons, now, emptyDiagnostics(now, universeCount));
    }

    const technicalStage = await fetchTechnicalStage(client, shortlist, providerErrors, now);
    const liquidityBySymbol = new Map(liquidityCandidates.map((entry) => [entry.symbol, entry]));
    const tickerBySymbol = new Map(tickers.map((entry) => [entry.symbol, entry]));
    const peerInputs = technicalStage.map((stage) => ({
      metrics15m: stage.primary,
      metrics1h: stage.trend,
      change24h: tickerBySymbol.get(stage.candidate.symbol)?.priceChangePercent ?? 0,
      volumeRatio24h: stage.primary.volumeRatio,
      universeCount,
    }));

    // Technical ranking uses the existing 100-point model but does not discard
    // imperfect trend/position; it identifies the expensive deep-scan subset.
    const rejectedTechnical = technicalStage.filter((entry) => entry.primary.rsi14 >= SCAN_CONFIG.rsiExtreme);
    const technicalRanked = technicalStage
      .filter((entry) => entry.primary.rsi14 < SCAN_CONFIG.rsiExtreme)
      .map((entry) => {
        const liquidity = liquidityBySymbol.get(entry.candidate.symbol)!;
        const ticker = tickerBySymbol.get(entry.candidate.symbol)!;
        const pattern = bestPattern(detectPatterns(entry.trend, entry.primary));
        const supportResistance = detectSupportResistance(entry.primaryKlines);
        return { entry, liquidity, ticker, pattern, supportResistance };
      })
      .filter((entry) => Boolean(entry.ticker))
      .map((entry) => ({ ...entry, technicalScore: scoreCandidate({
        trend: entry.entry.trend,
        primary: entry.entry.primary,
        pattern: entry.pattern,
        ticker24h: entry.ticker!,
        quoteVolume24h: entry.liquidity.quoteVolume24h,
        spreadPct: entry.liquidity.spreadPct ?? 99,
        supportResistance: entry.supportResistance ?? { support: entry.entry.primary.low20, resistance: entry.entry.primary.high20, distanceToResistancePct: ((entry.entry.primary.high20 - entry.entry.primary.close) / entry.entry.primary.close) * 100, distanceToSupportPct: ((entry.entry.primary.close - entry.entry.primary.low20) / entry.entry.primary.close) * 100, targetBlocked: false, method: "20-bar range" },
        marketRegimePoints: regime.points,
        lastCandleMovePct: 0,
      })}))
      .sort((left, right) => right.technicalScore.total - left.technicalScore.total || left.liquidity.symbol.localeCompare(right.liquidity.symbol));
    const rejectedTechnicalRanked = rejectedTechnical
      .map((entry) => ({
        entry,
        liquidity: liquidityBySymbol.get(entry.candidate.symbol)!,
        ticker: tickerBySymbol.get(entry.candidate.symbol)!,
        pattern: bestPattern(detectPatterns(entry.trend, entry.primary)),
        supportResistance: detectSupportResistance(entry.primaryKlines),
      }))
      .filter((entry) => Boolean(entry.ticker))
      .sort((left, right) => left.entry.candidate.symbol.localeCompare(right.entry.candidate.symbol));
    const technical = [
      ...technicalRanked,
      ...rejectedTechnicalRanked,
    ].slice(0, SCAN_CONFIG.deepScanSize);

    deepScanCount = technical.length;
    const deep = await mapWithConcurrency(technical, KLINE_CONCURRENCY, async (entry): Promise<EvaluatedCandidate | null> => {
      const { candidate, trend, primary } = entry.entry;
      try {
        const ticker = tickers.find((item) => item.symbol === candidate.symbol);
        if (!ticker) return null;
        const [microRaw, macroRaw, primaryRaw] = await Promise.all([
          client.klines(candidate.symbol, INTERVALS.confirmation, KLINE_LIMIT),
          client.klines(candidate.symbol, INTERVALS.macro, KLINE_LIMIT),
          client.klines(candidate.symbol, INTERVALS.primary, KLINE_LIMIT),
        ]);
        const micro = filterClosedKlines(microRaw, now);
        const macroKlines = filterClosedKlines(macroRaw, now);
        const primaryKlines = filterClosedKlines(primaryRaw, now);
        const metrics5m = buildIntervalMetrics(INTERVALS.confirmation, micro);
        const metrics4h = buildIntervalMetrics(INTERVALS.macro, macroKlines);
        const supportResistance = detectSupportResistance(primaryKlines);
        if (!metrics5m || !metrics4h || !supportResistance) return null;

        const spread = candidate.spreadPct;
        if (spread === null || !Number.isFinite(spread)) return null;
        const gate = evaluateRiskGate({
          ...gateInputBase,
          metrics15m: primary,
          ticker,
          quoteVolume24h: candidate.quoteVolume24h,
          spreadPct: spread,
          dataTimestamp: primaryKlines[primaryKlines.length - 1]?.closeTime ?? now,
          providerErrors: [],
        });
        if (!gate.passed) return null;
        const breakdown = scoreCandidate({
          trend,
          primary,
          pattern: bestPattern(detectPatterns(trend, primary)),
          ticker24h: ticker,
          quoteVolume24h: candidate.quoteVolume24h,
          spreadPct: spread,
          supportResistance,
          marketRegimePoints: regime.points,
          lastCandleMovePct: lastCandleMovePct(primaryKlines),
        });
        const trigger5m = assessTrigger(metrics5m);
        const macro = assessMacro(metrics4h);
        const distanceAtr = Math.abs(primary.distanceFromEma21Atr);
        const stretchPenalty = distanceAtr > 1.2
          ? Math.min(15, (distanceAtr - 1.2) * 12)
          : 0;
        const softPenalty = Math.max(0, breakdown.penalty + stretchPenalty + (macro.quality < 45 ? 8 : 0));
        const relative = relativeStrength({
          metrics15m: primary,
          metrics1h: trend,
          change24h: ticker.priceChangePercent,
          volumeRatio24h: primary.volumeRatio,
          universeCount,
        }, peerInputs);
        const opportunity = opportunityScore({
          absolute: breakdown,
          relativeStrength: relative.score,
          liquidityQuality: candidate.liquidityPoints * 10,
          triggerQuality: trigger5m.quality,
          softRiskPenalty: softPenalty,
        }).opportunityScore;
        const status = decisionFrom(opportunity, trigger5m.confirmed, distanceAtr);
        const reasons = unique([
          trend.ema9 > trend.ema21 ? "1h 短期趋势偏强" : "1h 趋势仍在确认",
          trend.ema21Slope > 0 ? "1h EMA21 向上" : "1h 趋势斜率不足",
          ...macro.reasons,
          ...triggerReasons(trigger5m),
          supportResistance.targetBlocked ? "上方阻力较近" : "目标上方空间正常",
        ]);
        const risks = unique([...gate.warnings, ...regime.reasons, macro.quality < 45 ? "4h 大级别结构偏弱" : ""]);
        const price = primary.close;
        return {
          candidate,
          ticker,
          metrics15m: buildMetrics(primary, trend, spread),
          trend1h: trend,
          setup15m: primary,
          macro4h: metrics4h,
          trigger5m,
          score: breakdown.total,
          penalty: breakdown.penalty,
          opportunity,
          status,
          reasons,
          risks,
          plan: buildTradePlan(price, primary, supportResistance.support),
          evaluatedAt: primaryKlines[primaryKlines.length - 1]?.closeTime ?? now,
          recentKlines: primaryKlines.slice(-48),
          recentPrices: primaryKlines.slice(-48).map((kline) => kline.close),
        };
      } catch (error: unknown) {
        providerErrors.push(`${candidate.symbol}: ${describeBinanceError(error)}`);
        return null;
      }
    });

    const evaluated = deep.filter((entry): entry is EvaluatedCandidate => entry !== null);
    const ranked = [...evaluated].sort((left, right) => right.opportunity - left.opportunity || left.candidate.symbol.localeCompare(right.candidate.symbol));
    const statusRanked = [...ranked].sort((left, right) => STATUS_PRIORITY[right.status] - STATUS_PRIORITY[left.status] || right.opportunity - left.opportunity || left.candidate.symbol.localeCompare(right.candidate.symbol));
    const top = statusRanked[0] ?? null;
    const nextScore = ranked.find((entry) => entry.candidate.symbol !== top?.candidate.symbol)?.opportunity ?? null;
    const confidence = top ? confidenceFromRanking({ absolute: { trend: 0, momentum: 0, volume: 0, entry: 0, liquidity: 0, riskReward: 0, market: 0, penalty: top.penalty, total: top.score }, relativeStrength: 0, liquidityQuality: 0, triggerQuality: top.trigger5m.quality, softRiskPenalty: top.penalty }, nextScore).confidence : "LOW";
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
      topCandidates: [
        ...ranked.slice(0, DEBUG_CANDIDATE_LIMIT).map((entry, index) => {
      const debugCandidate = debugFromCandidate(entry);
          return index === 0 ? { ...debugCandidate, confidence } : {
            ...debugCandidate,
            confidence,
            rejectReason: `机会分 ${entry.opportunity.toFixed(1)} 低于本次最佳候选的 ${ranked[0].opportunity.toFixed(1)}`,
          };
        }),
        ...rejectedTechnical.slice(0, DEBUG_CANDIDATE_LIMIT).map((entry) => ({
          symbol: entry.candidate.symbol,
          quoteVolume24h: entry.candidate.quoteVolume24h,
          score: null,
          penalty: null,
          confidence: "LOW" as Confidence,
          status: "WATCH_ONLY" as ScanStatus,
          reasons: [`15m RSI ${entry.primary.rsi14.toFixed(1)} 极端过热，仅保留观察`],
          rejectReason: `15m RSI ${entry.primary.rsi14.toFixed(1)} 高于极端阈值 ${SCAN_CONFIG.rsiExtreme}`,
        })),
      ],
    };

    if (!top) {
      if (providerErrors.length > 0 || liquidityFilterCount === 0) {
        return halted(
          regime.regime,
          liquidityFilterCount === 0
            ? [`所有候选 24h 成交额低于 ${SCAN_CONFIG.minQuoteVolume24h / 1_000_000}M USDT 成交额下限，仅保留市场观察`]
            : ["暂无可评估候选，市场数据不完整"],
          regime.reasons,
          now,
          diagnostics,
        );
      }
      const fallbackEntry = technical[0]?.entry ?? null;
      const fallbackLiquidity = technical[0]?.liquidity ?? null;
      const rejectedEntry = fallbackEntry ? null : rejectedTechnical[0] ?? null;
      const fallbackPrimary = fallbackEntry?.primary ?? rejectedEntry?.primary ?? null;
      const fallbackTrend = fallbackEntry?.trend ?? rejectedEntry?.trend ?? null;
      const fallbackSymbol = fallbackEntry?.candidate.symbol ?? rejectedEntry?.candidate.symbol ?? null;
      if (!fallbackPrimary || !fallbackTrend || !fallbackSymbol) {
        return halted(regime.regime, ["暂无可评估候选，市场数据不完整"], regime.reasons, now, diagnostics);
      }
      const watchResult: ScanResult = {
        status: "WATCH_ONLY",
        symbol: fallbackSymbol,
        baseAsset: fallbackSymbol.replace(/USDT$/, ""),
        price: fallbackPrimary.close,
        score: 0,
        targetPct: SCAN_CONFIG.targetPct,
        marketRegime: regime.regime,
        reasons: [
          fallbackPrimary.rsi14 >= SCAN_CONFIG.rsiExtreme
            ? `15m RSI ${fallbackPrimary.rsi14.toFixed(1)} 极端过热，仅保留观察`
            : "当前候选未通过完整评估，仅保留观察",
        ],
        risks: ["5m/4h 数据不完整"],
        metrics: buildMetrics(fallbackPrimary, fallbackTrend, fallbackLiquidity?.spreadPct ?? 0),
        plan: null,
        generatedAt: new Date(now).toISOString(),
        strategyVersion: STRATEGY_VERSION,
        absoluteScore: 0,
        opportunityScore: 0,
        marketRank: 1,
        relativeRank: 1,
        confidence: "LOW",
        topCandidates: [],
      };
      return { result: watchResult, diagnostics, cached: false };
    }

    const baseAsset = top.candidate.symbol.replace(/USDT$/, "");
    const result: ScanResult = {
      status: top.status,
      symbol: top.candidate.symbol,
      baseAsset,
      price: top.plan.referencePrice,
      score: top.status === "WATCH_ONLY" ? 0 : top.score,
      targetPct: SCAN_CONFIG.targetPct,
      marketRegime: regime.regime,
      reasons: unique(top.reasons),
      risks: unique(top.risks),
      metrics: top.metrics15m,
      plan: top.plan,
      generatedAt: new Date(now).toISOString(),
      strategyVersion: STRATEGY_VERSION,
      absoluteScore: top.score,
      opportunityScore: top.opportunity,
      marketRank: 1,
      relativeRank: 1,
      confidence,
      topCandidates: ranked.slice(0, 3).map(toSummary),
    };
    return { result, diagnostics, cached: false };
  } catch (error: unknown) {
    if (isBinanceError(error)) throw error;
    throw new BinanceError(describeBinanceError(error), { code: "DATA_UNAVAILABLE", endpoint: "runScan", cause: error });
  }
}

function halted(regime: MarketRegimeAssessment["regime"], reasons: string[], risks: string[], now: number, diagnostics: ScanDiagnostics): ScanPayload {
  const status = liquidityOnlyHalt(reasons) ? "WATCH_ONLY" : "MARKET_HALT";
  return {
    result: {
      status,
      symbol: null,
      baseAsset: null,
      price: null,
      score: 0,
      targetPct: SCAN_CONFIG.targetPct,
      marketRegime: regime,
      reasons: unique(reasons),
      risks: unique(risks),
      metrics: null,
      plan: null,
      generatedAt: new Date(now).toISOString(),
      strategyVersion: STRATEGY_VERSION,
    },
    diagnostics,
    cached: false,
  };
}

function liquidityOnlyHalt(reasons: readonly string[]): boolean {
  return reasons.some((reason) => reason.includes("成交额下限"));
}

function emptyDiagnostics(now: number, universeCount: number): ScanDiagnostics {
  return { universeCount, liquidityFilterCount: 0, technicalScanCount: 0, deepScanCount: 0, candidateCount: 0, topCandidate: null, topScore: null, scanDurationMs: Date.now() - now, dataTimestamp: now, providerErrors: [], topCandidates: [] };
}
