import type { ReactNode } from "react";
import { motion } from "motion/react";

import { FreshnessBadge } from "@/client/components/FreshnessBadge";
import { STATUS_LABELS, STATUS_TAGLINES } from "@/client/lib/labels";
import { fadeInUp } from "@/client/animations/variants";
import type { ScanResult } from "@/shared/types";

interface NoTradeCardProps {
  result: ScanResult;
  stale?: boolean;
  onRescan?: () => void;
  rescanning?: boolean;
  notice?: string;
}

/** Halt card: only systemic failure or data loss uses this result. */
export function NoTradeCard({
  result,
  stale = false,
  onRescan,
  rescanning = false,
  notice,
}: NoTradeCardProps): ReactNode {
  return (
    <motion.section
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className="panel space-y-5 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="pill bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
          {STATUS_LABELS[result.status]}
        </span>
        <FreshnessBadge generatedAt={result.generatedAt} stale={stale} />
      </div>

      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {STATUS_LABELS[result.status]}
        </h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          {notice ?? STATUS_TAGLINES[result.status]}
        </p>
      </div>

      {result.reasons.length > 0 ? (
        <div className="space-y-2">
          <h3 className="field-label">为什么不出手</h3>
          <ul className="space-y-1.5">
            {result.reasons.map((reason) => (
              <li key={reason} className="flex gap-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                <span aria-hidden className="text-[var(--text-quaternary)]">
                  ·
                </span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.risks.length > 0 ? (
        <div className="space-y-2">
          <h3 className="field-label">当前市场的主要压力</h3>
          <ul className="space-y-1.5">
            {result.risks.map((risk) => (
              <li key={risk} className="flex gap-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                <span aria-hidden className="text-[var(--danger)]">
                  ·
                </span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {onRescan !== undefined ? (
        <button
          type="button"
          onClick={onRescan}
          disabled={rescanning}
          className="w-full rounded-full bg-[var(--brand-primary)] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-hover)] disabled:text-[var(--text-quaternary)]"
        >
          {rescanning ? "正在扫描" : "重新扫描"}
        </button>
      ) : null}
    </motion.section>
  );
}
