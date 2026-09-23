import type { ReactNode } from "react";
import { motion } from "motion/react";
import { DecisionBadge } from "./DecisionBadge";
import { MiniPriceChart } from "./MiniPriceChart";
import { OpportunityScore } from "./OpportunityScore";
import { TradePlanGrid } from "./TradePlanGrid";
import { formatPrice, formatSymbolPair } from "@/client/lib/format";
import type { ScanResult } from "@/shared/types";

export function CandidateHero({ result, recentPrices }: {
  result: ScanResult;
  recentPrices?: number[];
}): ReactNode {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-[var(--blur)] sm:p-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[var(--text-secondary)]">#1 TODAY</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">{formatSymbolPair(result.symbol)}</h1>
        </div>
        <DecisionBadge status={result.status} />
      </div>
      <div className="mt-4 flex items-baseline gap-3">
        <p className="tabular text-3xl font-semibold">{formatPrice(result.price)}</p>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_220px]">
        <MiniPriceChart prices={recentPrices} entryLow={result.plan?.entryZoneLow} entryHigh={result.plan?.entryZoneHigh} />
        <OpportunityScore score={result.opportunityScore ?? result.score} confidence={result.confidence} />
      </div>
      {result.plan ? <div className="mt-5"><TradePlanGrid plan={result.plan} /></div> : null}
    </motion.article>
  );
}
