import type { IntervalMetrics } from "@/shared/types";

export interface RelativeStrengthInput {
  metrics15m: IntervalMetrics;
  metrics1h: IntervalMetrics;
  change24h: number;
  volumeRatio24h: number;
  universeCount: number;
}

export interface RelativeStrengthResult {
  score: number;
  return15mPercentile: number;
  return1hPercentile: number;
  return24hPercentile: number;
  volumeExpansionPercentile: number;
  trendQualityPercentile: number;
}

function percentileOf(value: number, values: readonly number[]): number {
  if (values.length === 0) return 0;
  const below = values.reduce((count, item) => count + (item < value ? 1 : 0), 0);
  const equal = values.reduce((count, item) => count + (item === value ? 1 : 0), 0);
  return ((below + equal * 0.5) / values.length) * 100;
}

export function relativeStrength(
  input: RelativeStrengthInput,
  peers: readonly RelativeStrengthInput[],
): RelativeStrengthResult {
  const return15m = ((input.metrics15m.close - input.metrics15m.ema21) / input.metrics15m.ema21) * 100;
  const return1h = ((input.metrics1h.close - input.metrics1h.ema21) / input.metrics1h.ema21) * 100;
  const trendQuality =
    (input.metrics1h.ema9 > input.metrics1h.ema21 ? 25 : 0) +
    (input.metrics1h.ema21 > input.metrics1h.ema55 ? 25 : 0) +
    (input.metrics1h.higherHigh && input.metrics1h.higherLow ? 50 : 0);

  const percentiles = peers.map((peer) => ({
    return15m: ((peer.metrics15m.close - peer.metrics15m.ema21) / peer.metrics15m.ema21) * 100,
    return1h: ((peer.metrics1h.close - peer.metrics1h.ema21) / peer.metrics1h.ema21) * 100,
    return24h: peer.change24h,
    volume: peer.volumeRatio24h,
    trend:
      (peer.metrics1h.ema9 > peer.metrics1h.ema21 ? 25 : 0) +
      (peer.metrics1h.ema21 > peer.metrics1h.ema55 ? 25 : 0) +
      (peer.metrics1h.higherHigh && peer.metrics1h.higherLow ? 50 : 0),
  }));

  const return15mPercentile = percentileOf(return15m, percentiles.map((item) => item.return15m));
  const return1hPercentile = percentileOf(return1h, percentiles.map((item) => item.return1h));
  const return24hPercentile = percentileOf(input.change24h, percentiles.map((item) => item.return24h));
  const volumeExpansionPercentile = percentileOf(input.volumeRatio24h, percentiles.map((item) => item.volume));
  const trendQualityPercentile = percentileOf(trendQuality, percentiles.map((item) => item.trend));

  const score =
    return15mPercentile * 0.16 +
    return1hPercentile * 0.24 +
    return24hPercentile * 0.14 +
    volumeExpansionPercentile * 0.2 +
    trendQualityPercentile * 0.26;

  return {
    score: Math.round(score * 100) / 100,
    return15mPercentile: Math.round(return15mPercentile),
    return1hPercentile: Math.round(return1hPercentile),
    return24hPercentile: Math.round(return24hPercentile),
    volumeExpansionPercentile: Math.round(volumeExpansionPercentile),
    trendQualityPercentile: Math.round(trendQualityPercentile),
  };
}
