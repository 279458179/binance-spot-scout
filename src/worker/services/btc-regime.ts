/**
 * BTC market-regime service backing the `market:btc-regime` KV entry.
 *
 * The regime is the cheapest signal in the whole scan, so it is cached on a
 * short TTL and shared by every consumer: the scanner reads it to decide
 * whether risk-on entries are allowed at all, and the detail route reuses the
 * same snapshot so a symbol page never disagrees with the dashboard.
 */

import { INTERVALS } from "@/config/strategy";
import { readBtcRegime, writeBtcRegime } from "@/lib/cache";
import { buildIntervalMetrics } from "@/lib/indicators/metrics";
import { assessMarketRegime } from "@/strategy";

import type { BtcRegimeSnapshot } from "@/lib/cache";
import type { Kline } from "@/shared/types";

import { createMarketClient } from "./market-client";

const BTC_SYMBOL = "BTCUSDT";
const REGIME_KLINE_LIMIT = 200;

/**
 * Percentage drop of the latest 1h candle, expressed as a positive number.
 *
 * Mirrors the scanner's private helper: an up candle yields a negative value,
 * and an unusable series yields `null` so the regime input stays optional.
 */
function btcDropPct1h(klines: readonly Kline[]): number | null {
  if (klines.length < 2) {
    return null;
  }

  const previous = klines[klines.length - 2];
  const latest = klines[klines.length - 1];

  if (previous === undefined || latest === undefined || previous.close <= 0) {
    return null;
  }

  return ((previous.close - latest.close) / previous.close) * 100;
}

function neutralSnapshot(reasons: readonly string[]): BtcRegimeSnapshot {
  return {
    regime: "NEUTRAL",
    points: 0,
    btcDropPct1h: null,
    reasons: [...reasons],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Resolve the current BTC regime, preferring the cached snapshot.
 *
 * Never throws: a Binance outage degrades to a neutral regime so the rest of
 * the request can still render instead of failing outright.
 */
export async function resolveBtcRegime(
  kv: KVNamespace,
  baseUrlsVar?: string,
): Promise<BtcRegimeSnapshot> {
  const cached = await readBtcRegime(kv);

  if (cached !== null) {
    return cached;
  }

  try {
    const client = createMarketClient(baseUrlsVar);
    const [trendKlines, primaryKlines] = await Promise.all([
      client.klines(BTC_SYMBOL, INTERVALS.trend, REGIME_KLINE_LIMIT),
      client.klines(BTC_SYMBOL, INTERVALS.primary, REGIME_KLINE_LIMIT),
    ]);

    const metrics1h = buildIntervalMetrics(INTERVALS.trend, trendKlines);
    const metrics15m = buildIntervalMetrics(INTERVALS.primary, primaryKlines);
    const dropPct1h = btcDropPct1h(trendKlines);
    const assessment = assessMarketRegime({
      metrics1h,
      metrics15m,
      btcDropPct1h: dropPct1h,
    });

    const snapshot: BtcRegimeSnapshot = {
      regime: assessment.regime,
      points: assessment.points,
      btcDropPct1h: dropPct1h,
      reasons: [...assessment.reasons],
      updatedAt: new Date().toISOString(),
    };

    await writeBtcRegime(kv, snapshot);

    return snapshot;
  } catch (error) {
    console.warn("btc regime lookup failed", error);

    return neutralSnapshot(["BTC 行情数据暂不可用，按中性市场处理"]);
  }
}
