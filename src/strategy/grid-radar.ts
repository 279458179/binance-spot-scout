/**
 * Deterministic grid opportunity screening adapted from the Grid Radar
 * research prototype. It never calls a trading endpoint.
 *
 * Scores describe rule fitness, NEVER expected returns or success probability.
 * Grid net step estimates exclude inventory mark-to-market losses, funding,
 * liquidation, order queue position and exchange-specific bot mechanics.
 */
import type { Kline } from "@/shared/types";
import type { GridAnalysis, GridKind, GridMarket, GridPlan } from "@/shared/grid";

const NOTICE = "只读行情研究，非盈利承诺。单格理论收益不代表整体净收益；合约另有资金费、强平、滑点及交易所规则风险。";
const MIN_QUOTE_VOLUME = 20_000_000;
const MIN_GRID_NOTIONAL = 8; // heuristic only; NOT an exchange symbol filter

export interface GridInput {
  symbol: string;
  market: GridMarket;
  candles1h: readonly Kline[];
  candles4h: readonly Kline[];
  price: number;
  change24hPct: number;
  quoteVolume24h: number;
  fundingRate: number | null;
  budgetUsdt: number;
  now: number;
}

interface Signals {
  adx: number;
  atr: number;
  ema20: number;
  ema50: number;
  high20: number;
  low20: number;
}

function digits(value: number, precision = 3): number {
  return Number(value.toFixed(precision));
}

function smooth(values: readonly number[], alpha: number): number[] {
  let previous = values[0] ?? 0;
  return values.map((value) => {
    previous += alpha * (value - previous);
    return previous;
  });
}

function signals(candles: readonly Kline[]): Signals | null {
  if (candles.length < 80) return null;
  const prices = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  if (candles.some((candle) =>
    !Number.isFinite(candle.close) || candle.close <= 0 ||
    !Number.isFinite(candle.high) || !Number.isFinite(candle.low) ||
    candle.high < candle.low || candle.high < candle.close || candle.low > candle.close
  )) return null;

  const tr: number[] = [];
  const positive: number[] = [];
  const negative: number[] = [];
  for (let i = 0; i < prices.length; i += 1) {
    const prev = prices[i - 1] ?? prices[i];
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - prev), Math.abs(lows[i] - prev)));
    const up = i === 0 ? 0 : highs[i] - highs[i - 1];
    const down = i === 0 ? 0 : lows[i - 1] - lows[i];
    positive.push(up > down && up > 0 ? up : 0);
    negative.push(down > up && down > 0 ? down : 0);
  }
  const atrSeries = smooth(tr, 1 / 14);
  const plusSeries = smooth(positive, 1 / 14);
  const minusSeries = smooth(negative, 1 / 14);
  const dx = atrSeries.map((atrValue, i) => {
    if (atrValue <= 0) return 0;
    const p = plusSeries[i] / atrValue;
    const m = minusSeries[i] / atrValue;
    return p + m <= 0 ? 0 : (100 * Math.abs(p - m)) / (p + m);
  });
  const adx = smooth(dx, 1 / 14).at(-1);
  const ema20 = smooth(prices, 2 / 21).at(-1);
  const ema50 = smooth(prices, 2 / 51).at(-1);
  const atr = atrSeries.at(-1);
  if (adx === undefined || ema20 === undefined || ema50 === undefined ||
      atr === undefined || ![adx, ema20, ema50, atr].every(Number.isFinite)) return null;
  return {
    adx, atr, ema20, ema50,
    high20: Math.max(...highs.slice(-21, -1)),
    low20: Math.min(...lows.slice(-21, -1)),
  };
}

function base(input: GridInput, kind: GridKind): GridAnalysis {
  return {
    symbol: input.symbol,
    market: input.market,
    decision: "UNAVAILABLE",
    kind,
    generatedAt: new Date(input.now).toISOString(),
    price: Number.isFinite(input.price) && input.price > 0 ? input.price : null,
    change24hPct: Number.isFinite(input.change24hPct) ? digits(input.change24hPct) : null,
    adx1h: null,
    adx4h: null,
    atr1hPct: null,
    fundingRatePct: input.market === "futures" && input.fundingRate !== null
      ? digits(input.fundingRate * 100, 5) : null,
    score: null,
    reasons: [],
    plan: null,
    dataSource: input.market === "spot" ? "Binance Global Spot" : "Binance USD-M Futures",
    notice: NOTICE,
  };
}

/** Takes CLOSED 1h/4h candles. Fail closed on stale, incomplete or incoherent data. */
export function analyzeGrid(input: GridInput): GridAnalysis {
  const kind: GridKind = input.market === "spot" ? "现货网格" : "合约中性网格";
  const result = base(input, kind);
  const { candles1h, candles4h, now, price, budgetUsdt, market } = input;
  const h1 = candles1h.at(-1);
  const h4 = candles4h.at(-1);
  const fresh = h1 !== undefined && h4 !== undefined &&
    h1.closeTime <= now && h4.closeTime <= now &&
    now - h1.closeTime >= 0 && now - h1.closeTime < 2 * 60 * 60_000 &&
    now - h4.closeTime >= 0 && now - h4.closeTime < 8 * 60 * 60_000;
  const noGaps = (bars: readonly Kline[], intervalMs: number) =>
    bars.slice(-80).every((bar, i, recent) =>
      i === 0 || bar.openTime - recent[i - 1].openTime === intervalMs);
  const valid = Number.isFinite(now) && Number.isFinite(price) && price > 0 &&
    Number.isFinite(input.change24hPct) && Number.isFinite(input.quoteVolume24h) &&
    input.quoteVolume24h >= 0 && Number.isFinite(budgetUsdt) &&
    budgetUsdt >= 10 && budgetUsdt <= 1_000_000 &&
    (market === "spot" || (input.fundingRate !== null && Number.isFinite(input.fundingRate))) &&
    fresh && noGaps(candles1h, 3_600_000) && noGaps(candles4h, 14_400_000);
  const a = signals(candles1h);
  const b = signals(candles4h);
  if (!valid || a === null || b === null) {
    result.reasons = ["行情、预算或资金费率数据不完整/过期，暂停给出参数。"];
    return result;
  }

  const atrPct = (a.atr / price) * 100;
  const emaSpreadPct = (Math.abs(b.ema20 - b.ema50) / price) * 100;
  const deviationPct = (Math.abs(price - b.ema20) / price) * 100;
  const breakout = price > a.high20 || price < a.low20;
  const liquid = input.quoteVolume24h >= MIN_QUOTE_VOLUME;
  const fundingOk = market === "spot" || Math.abs(input.fundingRate ?? 0) <= 0.00025;
  result.adx1h = digits(a.adx, 1);
  result.adx4h = digits(b.adx, 1);
  result.atr1hPct = digits(atrPct);
  const sideways = a.adx < 23 && b.adx < 25 &&
    emaSpreadPct < 2.2 && deviationPct < 3 &&
    Math.abs(input.change24hPct) < 4 && atrPct >= 0.18 && atrPct <= 2.8 &&
    !breakout && liquid && fundingOk;

  if (sideways) {
    const half = Math.min(price * 0.08, Math.max(price * 0.03, 3 * a.atr));
    const lower = price - half;
    const upper = price + half;
    const feeEachSidePct = market === "spot" ? 0.1 : 0.04;
    const costPct = feeEachSidePct * 2 + 0.06; // example taker + slippage, not actual user tier
    const maxByFees = Math.floor(((upper - lower) / price * 100) / (costPct + 0.18));
    const leverage = market === "spot" ? 1 : 2; // illustration, NOT margin advice
    const notional = budgetUsdt * leverage;
    const count = Math.min(24, maxByFees, Math.floor(notional / MIN_GRID_NOTIONAL));
    if (count >= 6) {
      const spacing: GridPlan["spacing"] = (upper - lower) / price > 0.08 ? "等比" : "等差";
      const stepPct = spacing === "等比"
        ? ((upper / lower) ** (1 / count) - 1) * 100
        : ((upper - lower) / count / price) * 100;
      result.decision = "CANDIDATE";
      result.score = Math.round(Math.min(88, Math.max(70,
        84 - a.adx * 0.25 - b.adx * 0.2 + 3 * Math.min(atrPct, 2))));
      result.reasons = ["1h/4h 趋势较弱，且波动、成交额与区间位置通过初筛。",
        "下方参数仅为网格研究候选，未做订单级历史收益验证。"];
      result.plan = {
        lower: digits(lower, 6), upper: digits(upper, 6), count, spacing,
        grossStepPct: digits(stepPct), estimatedNetStepPct: digits(stepPct - costPct),
        roundTripCostPct: digits(costPct), assumedMinOrderUsdt: MIN_GRID_NOTIONAL,
        budgetUsdt, assumedLeverage: leverage, perGridNotionalUsdt: digits(notional / count, 2),
        invalidation: "突破网格上下限、1h ADX ≥ 30、剧烈单边趋势或数据异常时重新评估；合约可能提前强平。",
      };
      return result;
    }
    result.decision = "AVOID";
    result.reasons = ["预算不足以同时满足至少 6 格、预估成交成本及每格 8 USDT 名义额假设。"];
    return result;
  }

  const rising = a.ema20 > a.ema50 && b.ema20 > b.ema50 && a.adx >= 24 && b.adx >= 22;
  const falling = a.ema20 < a.ema50 && b.ema20 < b.ema50 && a.adx >= 24 && b.adx >= 22;
  if (liquid && fundingOk && (rising || (falling && market === "futures"))) {
    result.decision = "WATCH";
    result.kind = market === "spot" ? "现货趋势观察" : "合约趋势观察";
    result.score = 65;
    result.reasons = ["趋势方向较一致，但不属于低趋势震荡网格行情。",
      rising ? "上行趋势：等待回调及再次确认。" : "下行趋势：仅作空头行情观察，不构成立即做空建议。"];
    return result;
  }
  result.decision = "AVOID";
  result.score = 15;
  result.reasons = [
    breakout ? "突破近 20 根已收盘 1h K 线区间。" : "",
    !liquid ? "24h 成交额不足。" : "",
    !fundingOk ? "合约资金费率绝对值偏高。" : "",
    Math.abs(input.change24hPct) >= 4 ? "24h 单边波动偏大。" : "",
    a.adx >= 23 || b.adx >= 25 ? "趋势强度偏高，不强推震荡网格。" : "",
    atrPct < 0.18 ? "波动不足以覆盖假设成本。" : "",
  ].filter(Boolean);
  if (result.reasons.length === 0) result.reasons = ["现有条件未满足网格初筛，等待下一轮已收盘 K 线。"];
  return result;
}
