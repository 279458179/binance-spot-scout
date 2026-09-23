import type { ReactNode } from "react";
import { useState } from "react";
import { motion } from "motion/react";

import { FreshnessBadge } from "@/client/components/FreshnessBadge";
import { ScoreBreakdown } from "@/client/components/ScoreBreakdown";
import { useSymbolDetail } from "@/client/hooks/useSymbolDetail";
import { formatPrice } from "@/client/lib/format";
import { fadeInUp } from "@/client/animations/variants";
import type { ScanResult } from "@/shared/types";

interface ResultCardProps {
  result: ScanResult;
  stale?: boolean;
}

/**
 * Binance Spot trade page for a symbol.
 *
 * The product is a research tool and never places orders, so the handoff to the
 * exchange is an explicit link the visitor clicks themselves.
 */
function binanceTradeUrl(symbol: string): string {
  const base = symbol.replace(/USDT$/, "");
  return `https://www.binance.com/en/trade/${base}_USDT?type=spot`;
}

/** Candidate card: the single best name the current market can offer. */
export function ResultCard({
  result,
  stale = false,
}: ResultCardProps): ReactNode {
  const [showDetail, setShowDetail] = useState(false);
  const { detail, error, loading } = useSymbolDetail(showDetail ? result.symbol : null);

  const blocked = stale;
  const plan = result.plan;
  const symbol = result.symbol;

  return (
    <motion.section
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className="panel space-y-5 p-5 sm:p-6"
    >
      <div className="flex items-center justify-end">
        <FreshnessBadge generatedAt={result.generatedAt} stale={stale} />
      </div>

      {blocked ? (
        <p className="rounded-2xl bg-honey-950/70 p-3 text-sm leading-relaxed text-honey-300">
          数据已过期，仅供参考。请先重新扫描再决定是否行动。
        </p>
      ) : null}

      {plan !== null ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/5 p-3">
            <dt className="field-label">参考入场</dt>
            <dd className="field-value tabular">{formatPrice(plan.referencePrice)}</dd>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <dt className="field-label">+3%</dt>
            <dd className="field-value tabular">{formatPrice(plan.target3Pct)}</dd>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <dt className="field-label">+5%</dt>
            <dd className="field-value tabular">{formatPrice(plan.target5Pct)}</dd>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <dt className="field-label">失效参考</dt>
            <dd className="field-value tabular">{formatPrice(plan.invalidation)}</dd>
          </div>
        </dl>
      ) : null}

      <div className="space-y-3 border-t border-white/5 pt-4">
        <button
          type="button"
          onClick={() => setShowDetail((prev) => !prev)}
          className="text-xs font-semibold text-ink-300 underline decoration-white/20 underline-offset-4"
        >
          {showDetail ? "收起评分拆解" : "查看评分拆解"}
        </button>
        {showDetail ? (
          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-ink-400">正在读取拆解…</p>
            ) : (
              <ScoreBreakdown score={detail?.score ?? null} />
            )}
            {error !== null ? <p className="text-sm text-coral-300">{error}</p> : null}
            {(detail?.notes?.length ?? 0) > 0 ? (
              <ul className="space-y-1">
                {(detail?.notes ?? []).map((note) => (
                  <li key={note} className="text-xs leading-relaxed text-ink-400">
                    · {note}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {symbol !== null ? (
          <a
            href={binanceTradeUrl(symbol)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-2xl border border-white/10 px-5 py-3 text-center text-sm font-semibold text-ink-200 transition-colors hover:bg-white/5"
          >
            打开 Binance
          </a>
        ) : null}
      </div>
    </motion.section>
  );
}
