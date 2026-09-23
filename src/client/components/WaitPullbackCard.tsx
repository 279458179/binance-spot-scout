import type { ReactNode } from "react";
import { motion } from "motion/react";

import { FreshnessBadge } from "@/client/components/FreshnessBadge";
import { formatPrice, formatScore, formatSymbolPair } from "@/client/lib/format";
import { STATUS_LABELS, STATUS_TAGLINES } from "@/client/lib/labels";
import { fadeInUp } from "@/client/animations/variants";
import type { ScanResult } from "@/shared/types";

interface WaitPullbackCardProps {
  result: ScanResult;
  stale?: boolean;
  onRescan?: () => void;
  rescanning?: boolean;
}

/** Pullback card: the candidate holds, but the planned entry is better. */
export function WaitPullbackCard({
  result,
  stale = false,
  onRescan,
  rescanning = false,
}: WaitPullbackCardProps): ReactNode {
  const plan = result.plan;

  return (
    <motion.section
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className="panel space-y-5 border border-honey-400/20 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="pill bg-honey-950 text-honey-300">
          {STATUS_LABELS[result.status]}
        </span>
        <FreshnessBadge generatedAt={result.generatedAt} stale={stale} />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {formatSymbolPair(result.symbol)}
        </h2>
        <p className="text-sm leading-relaxed text-ink-300">
          {STATUS_TAGLINES[result.status]}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/5 p-3">
          <span className="field-label">综合评分</span>
          <p className="tabular text-xl font-semibold text-honey-300">
            {formatScore(result.score)}
            <span className="text-sm font-normal text-ink-400"> / 100</span>
          </p>
        </div>
        <div className="rounded-2xl bg-white/5 p-3">
          <span className="field-label">当前价</span>
          <p className="tabular text-xl font-semibold text-ink-100">
            {formatPrice(result.price)}
          </p>
        </div>
      </div>

      {plan !== null ? (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/5 p-3">
            <dt className="field-label">参考入场</dt>
            <dd className="field-value tabular">{formatPrice(plan.referencePrice)}</dd>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <dt className="field-label">目标价</dt>
            <dd className="field-value tabular">{formatPrice(plan.target5Pct)}</dd>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <dt className="field-label">失效参考</dt>
            <dd className="field-value tabular">{formatPrice(plan.invalidation)}</dd>
          </div>
        </dl>
      ) : null}

      {result.reasons.length > 0 ? (
        <ul className="space-y-1.5">
          {result.reasons.map((reason) => (
            <li key={reason} className="flex gap-2 text-sm leading-relaxed text-ink-200">
              <span aria-hidden className="text-honey-400">
                →
              </span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {onRescan !== undefined ? (
        <button
          type="button"
          onClick={onRescan}
          disabled={rescanning}
          className="w-full rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-ink-200 disabled:text-ink-500"
        >
          {rescanning ? "重新扫描中…" : "重新扫描"}
        </button>
      ) : null}
    </motion.section>
  );
}
