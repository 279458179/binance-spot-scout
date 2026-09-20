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

/** NO_TRADE card: the honest answer when nothing clears the bar. */
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
        <span className="pill bg-white/5 text-ink-200">
          {STATUS_LABELS.NO_TRADE}
        </span>
        <FreshnessBadge generatedAt={result.generatedAt} stale={stale} />
      </div>

      <div className="space-y-2 text-center">
        <span aria-hidden className="block text-4xl">
          🐱
        </span>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          今天不出手
        </h2>
        <p className="text-sm leading-relaxed text-ink-400">
          {notice ?? STATUS_TAGLINES.NO_TRADE}
        </p>
      </div>

      {result.risks.length > 0 ? (
        <div className="space-y-2">
          <h3 className="field-label">当前市场的主要压力</h3>
          <ul className="space-y-1.5">
            {result.risks.map((risk) => (
              <li key={risk} className="flex gap-2 text-sm leading-relaxed text-ink-300">
                <span aria-hidden className="text-coral-300">
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
          className="w-full rounded-2xl bg-white/10 px-5 py-3 text-sm font-semibold text-ink-100 transition-colors hover:bg-white/15 disabled:text-ink-500"
        >
          {rescanning ? "重新扫描中…" : "重新扫描"}
        </button>
      ) : null}
    </motion.section>
  );
}
