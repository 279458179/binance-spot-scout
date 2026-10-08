/** Public-market-only research types. Nothing in this module can place orders. */
export type GridMarket = "spot" | "futures";
export type GridDecision = "CANDIDATE" | "WATCH" | "AVOID" | "UNAVAILABLE";
export type GridKind = "现货网格" | "合约中性网格" | "现货趋势观察" | "合约趋势观察";

export interface GridPlan {
  lower: number;
  upper: number;
  count: number;
  spacing: "等比" | "等差";
  grossStepPct: number;
  estimatedNetStepPct: number;
  roundTripCostPct: number;
  assumedMinOrderUsdt: number;
  budgetUsdt: number;
  assumedLeverage: number;
  perGridNotionalUsdt: number;
  invalidation: string;
}

export interface GridAnalysis {
  symbol: string;
  market: GridMarket;
  decision: GridDecision;
  kind: GridKind;
  generatedAt: string;
  price: number | null;
  change24hPct: number | null;
  adx1h: number | null;
  adx4h: number | null;
  atr1hPct: number | null;
  fundingRatePct: number | null;
  score: number | null;
  reasons: string[];
  plan: GridPlan | null;
  dataSource: string;
  notice: string;
}
