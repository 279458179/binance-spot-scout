import { Hono } from "hono";
import { INTERVALS, SCAN_CONFIG } from "@/config/strategy";
import { createBinanceMarketClient, spreadPct } from "@/lib/binance";
import { buildIntervalMetrics } from "@/lib/indicators/metrics";
import type { SymbolDetail } from "@/shared/types";
import {
  bestPattern,
  detectPatterns,
  detectSupportResistance,
  evaluateRiskGate,
  scoreCandidate,
} from "@/strategy";
import type { Env } from "../env";
import { resolveBtcRegime } from "../services/btc-regime";
import { buildApiError } from "./api-error";

/** Symbols accepted by the detail route, e.g. BTCUSDT. */
const SYMBOL_PATTERN = /^[A-Z0-9]+USDT$/;

const WARNING_LABELS: Record<string, string> = {
  DATA_STALE: "数据超过 5 分钟未更新",
  BTC_RISK_OFF: "BTC 处于风险规避状态",
  EXTENDED_FROM_EMA21: "价格偏离 EMA21 较远",
  THIN_LIQUIDITY: "流动性偏薄",
  NEWS_UNAVAILABLE: "新闻面数据不可用",
};

function warningLabel(code: string): string {
  return WARNING_LABELS[code] ?? code;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function dropPct1h(klines: readonly { close: number }[]): number | null {
  const last = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  if (!last || !prev || prev.close <= 0) return null;
  return ((prev.close - last.close) / prev.close) * 100;
}

function candleMovePct(kline: { open: number; close: number } | undefined): number {
  if (!kline || kline.open <= 0) return 0;
  return ((kline.close - kline.open) / kline.open) * 100;
}

export const symbolRoute = new Hono<{ Bindings: Env }>();

/** Returns the full single-symbol analysis bundle without requesting the whole market. */
symbolRoute.get("/:symbol", async (c) => {
  const raw = c.req.param("symbol");
  if (raw !== raw.toUpperCase() || !SYMBOL_PATTERN.test(raw)) {
    return c.json(
      buildApiError("INVALID_REQUEST", "交易对格式无效，请使用类似 BTCUSDT 的大写格式"),
      400,
    );
  }

  const now = Date.now();
  const client = createBinanceMarketClient();
  const [klines5m, klines15m, klines1h, klines4h, tickers, books, regime] = await Promise.all([
    client.klines(raw, INTERVALS.confirmation, SCAN_CONFIG.klineLimit),
    client.klines(raw, INTERVALS.primary, SCAN_CONFIG.klineLimit),
    client.klines(raw, INTERVALS.trend, SCAN_CONFIG.klineLimit),
    client.klines(raw, INTERVALS.macro, SCAN_CONFIG.klineLimit),
    client.ticker24h([raw]),
    client.bookTicker([raw]),
    resolveBtcRegime(c.env.SCAN_CACHE),
  ]);

  const metrics5m = buildIntervalMetrics(INTERVALS.confirmation, klines5m);
  const metrics15m = buildIntervalMetrics(INTERVALS.primary, klines15m);
  const metrics1h = buildIntervalMetrics(INTERVALS.trend, klines1h);
  const metrics4h = buildIntervalMetrics(INTERVALS.macro, klines4h);

  const ticker = tickers[0] ?? null;
  const book = books[0] ?? null;
  const supportResistance = detectSupportResistance(klines15m);
  const patterns = metrics15m && metrics1h ? detectPatterns(metrics1h, metrics15m) : [];
  const pattern = bestPattern(patterns);

  const measuredSpread = book ? spreadPct(book) : null;
  const spread = measuredSpread !== null && Number.isFinite(measuredSpread) ? measuredSpread : null;

  const lastPrimary = klines15m[klines15m.length - 1];
  const quoteVolume24h = ticker?.quoteVolume ?? 0;

  let score: ReturnType<typeof scoreCandidate> | null = null;
  if (metrics15m && metrics1h && pattern && ticker && supportResistance && spread !== null) {
    score = scoreCandidate({
      trend: metrics1h,
      primary: metrics15m,
      pattern,
      ticker24h: ticker,
      quoteVolume24h,
      spreadPct: spread,
      supportResistance,
      marketRegimePoints: regime.points,
      lastCandleMovePct: candleMovePct(lastPrimary),
    });
  }

  const riskGate = evaluateRiskGate({
    metrics15m,
    ticker,
    book,
    quoteVolume24h,
    spreadPct: spread,
    btcDropPct1h: dropPct1h(klines1h),
    marketRegime: regime.regime,
    dataTimestamp: lastPrimary?.closeTime ?? now,
    now,
    klinesAvailable: true,
    providerErrors: [],
  });

  const detail: SymbolDetail = {
    symbol: raw,
    generatedAt: new Date(now).toISOString(),
    marketRegime: regime.regime,
    metrics15m,
    metrics1h,
    metrics5m,
    metrics4h,
    ticker,
    book,
    supportResistance,
    score,
    riskGate,
    patterns,
    notes: unique([...riskGate.warnings.map(warningLabel), ...regime.reasons]),
  };

  return c.json(detail);
});
