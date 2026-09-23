import type { ReactNode } from "react";
import { REGIME_LABELS } from "@/client/lib/labels";
import type { MarketRegime } from "@/shared/types";

const REGIME_TONE: Record<MarketRegime, string> = {
  RISK_ON: "text-[#6ff0b4]",
  NEUTRAL: "text-[#c7cedb]",
  RISK_OFF: "text-[#ff9aae]",
};

const REGIME_BIAS: Record<MarketRegime, string> = {
  RISK_ON: "偏强",
  NEUTRAL: "中性",
  RISK_OFF: "偏弱",
};

export function MarketPulse({ regime }: { regime: MarketRegime }): ReactNode {
  return (
    <section aria-label="市场状态" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[var(--text-secondary)]">
      <span className="flex items-center gap-1.5">
        BTC
        <span className={`font-semibold ${REGIME_TONE[regime]}`}>{REGIME_BIAS[regime]}</span>
      </span>
      <span>Alt Market <span className="text-[var(--text-primary)]">{REGIME_LABELS[regime]}</span></span>
      <span>Volatility <span className="text-[var(--text-primary)]">正常</span></span>
    </section>
  );
}
