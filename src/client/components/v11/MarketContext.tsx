import type { ReactNode } from "react";
import { MarketPulse } from "./MarketPulse";
import type { MarketRegime } from "@/shared/types";

export function MarketContext({ regime }: { regime: MarketRegime }): ReactNode {
  return <MarketPulse regime={regime} />;
}
