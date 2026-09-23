import type { ReactNode } from "react";

export function MiniPriceChart({ prices, entryLow, entryHigh }: {
  prices?: number[];
  entryLow?: number;
  entryHigh?: number;
}): ReactNode {
  const values = prices?.filter(Number.isFinite) ?? [];
  if (values.length < 2) return null;
  const min = Math.min(...values, entryLow ?? Infinity);
  const max = Math.max(...values, entryHigh ?? -Infinity);
  const range = max - min || 1;
  const points = values.map((value, index) => `${index / (values.length - 1) * 100},${34 - ((value - min) / range) * 30}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" className="h-16 w-full" role="img" aria-label="价格走势">
      <defs>
        <linearGradient id="price-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#34d99a" stopOpacity=".28" />
          <stop offset="100%" stopColor="#34d99a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,40 ${points} 100,40`} fill="url(#price-area)" stroke="none" />
      <polyline points={points} fill="none" stroke="#34d99a" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
