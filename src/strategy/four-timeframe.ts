import type { IntervalMetrics } from "@/shared/types";

export interface TriggerAssessment {
  confirmed: boolean;
  quality: number;
  reasons: string[];
}

export function assessTrigger(metrics: IntervalMetrics): TriggerAssessment {
  if (!metrics || !Number.isFinite(metrics.rsi14)) {
    return { confirmed: false, quality: 0, reasons: ["5m 数据不完整"] };
  }

  let quality = 0;
  const reasons: string[] = [];
  if (metrics.ema9 > metrics.ema21) {
    quality += 25;
    reasons.push("5m EMA9 在 EMA21 上方");
  }
  if (metrics.rsi14 >= 48 && metrics.rsi14 <= 72) {
    quality += 20;
    reasons.push(`5m RSI ${metrics.rsi14.toFixed(0)} 健康可控`);
  }
  if (metrics.macdHistogram > 0) {
    quality += 20;
    reasons.push("5m MACD 动能向上");
  } else if (metrics.macdHistogram > metrics.macdHistogramPrev) {
    quality += 8;
  }
  if (metrics.volumeRatio >= 1.2) {
    quality += 20;
    reasons.push(`5m 量能放大 ${metrics.volumeRatio.toFixed(1)}x`);
  }
  if (metrics.higherLow) {
    quality += 15;
    reasons.push("5m 出现更高低点");
  }
  if (metrics.close > metrics.vwap) {
    quality += 10;
  }

  return { confirmed: quality >= 70, quality, reasons };
}

export function assessMacro(metrics: IntervalMetrics): { quality: number; reasons: string[] } {
  const reasons: string[] = [];
  let quality = 0;
  if (metrics.close > metrics.ema21) {
    quality += 35;
    reasons.push("4h 价格在 EMA21 上方");
  }
  if (metrics.ema21Slope > 0) {
    quality += 25;
    reasons.push("4h EMA21 向上");
  }
  if (metrics.higherHigh && metrics.higherLow) {
    quality += 25;
  }
  if (metrics.rsi14 >= 45 && metrics.rsi14 <= 72) {
    quality += 15;
  }
  return { quality, reasons };
}
