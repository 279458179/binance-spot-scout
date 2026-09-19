/**
 * Pure, dependency-free technical indicators.
 *
 * Every function takes plain numbers (or `Kline[]`) and returns numbers, so the
 * whole module is trivially unit-testable and safe to reuse from the worker,
 * the backtest script and the browser bundle.
 *
 * Convention: functions return `null` (or `NaN` for the `*At` helpers) when
 * there is not enough history. Callers must treat `null` as "not ready" rather
 * than substituting a default.
 */

import type { Kline } from "@/shared/types";

export function sma(values: number[], period: number): number | null {
  if (!Number.isInteger(period) || period <= 0) return null;
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i += 1) sum += values[i];
  return sum / period;
}

/** Full SMA series aligned with `values`; leading entries are `null`. */
export function smaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (!Number.isInteger(period) || period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average. Seeded with the SMA of the first `period`
 * values, which is the convention Binance/TradingView charts use.
 */
export function ema(values: number[], period: number): number | null {
  const series = emaSeries(values, period);
  const last = series[series.length - 1];
  return last ?? null;
}

export function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (!Number.isInteger(period) || period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * Wilder's RSI. Returns `null` until `period + 1` values are available.
 * A flat series (no losses and no gains) yields 50 so callers never divide by 0.
 */
export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface MacdResult {
  macdLine: number | null;
  signal: number | null;
  histogram: number | null;
}

/** MACD using the classic 12/26/9 configuration. */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  if (values.length < slow + signalPeriod) {
    return { macdLine: null, signal: null, histogram: null };
  }
  const fastSeries = emaSeries(values, fast);
  const slowSeries = emaSeries(values, slow);
  const macdSeries: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const f = fastSeries[i];
    const s = slowSeries[i];
    if (f === null || s === null) continue;
    macdSeries.push(f - s);
  }
  if (macdSeries.length < signalPeriod) {
    return { macdLine: null, signal: null, histogram: null };
  }
  const signalValue = ema(macdSeries, signalPeriod);
  const macdLine = macdSeries[macdSeries.length - 1];
  if (signalValue === null) {
    return { macdLine, signal: null, histogram: null };
  }
  return { macdLine, signal: signalValue, histogram: macdLine - signalValue };
}

/**
 * Average True Range (Wilder smoothing).
 * `highs`/`lows`/`closes` must be the same length and ordered oldest -> newest.
 */
export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number | null {
  const len = Math.min(highs.length, lows.length, closes.length);
  if (len < period + 1) return null;
  const trueRanges: number[] = [];
  for (let i = 1; i < len; i += 1) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  if (trueRanges.length < period) return null;
  let prev = 0;
  for (let i = 0; i < period; i += 1) prev += trueRanges[i];
  prev /= period;
  for (let i = period; i < trueRanges.length; i += 1) {
    prev = (prev * (period - 1) + trueRanges[i]) / period;
  }
  return prev;
}

/** Arithmetic mean, `null` for an empty input. */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Median; `null` for an empty input. Does not mutate the input array. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Highest value over the trailing `period` values. */
export function highest(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  let max = -Infinity;
  for (let i = values.length - period; i < values.length; i += 1) {
    if (values[i] > max) max = values[i];
  }
  return max;
}

/** Lowest value over the trailing `period` values. */
export function lowest(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  let min = Infinity;
  for (let i = values.length - period; i < values.length; i += 1) {
    if (values[i] < min) min = values[i];
  }
  return min;
}

/**
 * Rolling volume-weighted average price over the last `period` bars using the
 * typical price `(h + l + c) / 3`. A zero-volume window returns `null`.
 */
export function vwap(klines: Kline[], period = 20): number | null {
  if (klines.length < period || period <= 0) return null;
  let pv = 0;
  let vol = 0;
  for (let i = klines.length - period; i < klines.length; i += 1) {
    const k = klines[i];
    const typical = (k.high + k.low + k.close) / 3;
    pv += typical * k.volume;
    vol += k.volume;
  }
  return vol === 0 ? null : pv / vol;
}

/**
 * Upper/lower wick share of a candle's total range.
 * Returns `{ upper: 0, lower: 0 }` for a zero-range candle.
 */
export function wickRatios(kline: Kline): { upper: number; lower: number } {
  const range = kline.high - kline.low;
  if (range <= 0) return { upper: 0, lower: 0 };
  const bodyTop = Math.max(kline.open, kline.close);
  const bodyBottom = Math.min(kline.open, kline.close);
  return {
    upper: Math.max(0, kline.high - bodyTop) / range,
    lower: Math.max(0, bodyBottom - kline.low) / range,
  };
}

/** Percentage change between two prices; `null` when the base is not positive. */
export function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to)) return null;
  return ((to - from) / from) * 100;
}

export function closes(klines: Kline[]): number[] {
  return klines.map((k) => k.close);
}

export function highs(klines: Kline[]): number[] {
  return klines.map((k) => k.high);
}

export function lows(klines: Kline[]): number[] {
  return klines.map((k) => k.low);
}

export function volumes(klines: Kline[]): number[] {
  return klines.map((k) => k.volume);
}

/**
 * Slope of the last `lookback` EMA values, normalised by price so values are
 * comparable across symbols. Positive means rising.
 */
export function normalisedSlope(series: (number | null)[], lookback = 3): number | null {
  if (series.length < lookback + 1) return null;
  const end = series[series.length - 1];
  const start = series[series.length - 1 - lookback];
  if (end === null || start === null || start === 0) return null;
  return ((end - start) / start) * 100;
}

