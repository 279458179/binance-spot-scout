import type { ReactNode } from "react";
import { useState } from "react";
import { motion } from "motion/react";

import { FreshnessBadge } from "@/client/components/FreshnessBadge";
import { ScoreBreakdown } from "@/client/components/ScoreBreakdown";
import { TargetTracker } from "@/client/components/TargetTracker";
import { useSymbolDetail } from "@/client/hooks/useSymbolDetail";
import { formatPrice, formatScore, formatSymbolPair } from "@/client/lib/format";
import { STATUS_LABELS } from "@/client/lib/labels";
import { fadeInUp } from "@/client/animations/variants";
import type { ScanResult } from "@/shared/types";

interface ResultCardProps {
  result: ScanResult;
  stale?: boolean;
  onRescan?: () => void;
  rescanning?: boolean;
}

/**
 * Asks for notification permission, if the browser has not decided yet.
 *
 * Called from a click handler on purpose: browsers only honour the prompt
 * during a user gesture, and the answer is irrelevant to the trade idea, so a
 * rejection is swallowed rather than surfaced.
 */
function requestNotifications(): void {
  if (typeof Notification === "undefined" || Notification.permission !== "default") {
    return;
  }
  void Notification.requestPermission().catch(() => undefined);
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

/** ENTRY_NOW card: the single candidate worth a look right now. */
export function ResultCard({
  result,
  stale = false,
  onRescan,
  rescanning = false,
}: ResultCardProps): ReactNode {
  const [tracking, setTracking] = useState(false);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="pill bg-mint-950 text-mint-300">
          {STATUS_LABELS.ENTRY_NOW}
        </span>
        <FreshnessBadge generatedAt={result.generatedAt} stale={stale} />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {formatSymbolPair(result.symbol)}
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="tabular text-xl text-ink-100 sm:text-2xl">
            {formatPrice(result.price)}
          </span>
          <span className="text-sm text-ink-400">目标 +{result.targetPct}%</span>
        </div>
      </div>

      {blocked ? (
        <p className="rounded-2xl bg-honey-950/70 p-3 text-sm leading-relaxed text-honey-300">
          数据已过期，仅供参考。请先重新扫描再决定是否行动。
        </p>
      ) : null}

      <div className="rounded-2xl bg-white/5 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-ink-300">综合评分</span>
          <span className="tabular text-2xl font-semibold text-mint-300">
            {formatScore(result.score)}
            <span className="text-base font-normal text-ink-400"> / 100</span>
          </span>
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
        <div className="space-y-2">
          <h3 className="field-label">入选理由</h3>
          <ul className="space-y-1.5">
            {result.reasons.map((reason) => (
              <li key={reason} className="flex gap-2 text-sm leading-relaxed text-ink-200">
                <span aria-hidden className="text-mint-400">
                  ✓
                </span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.risks.length > 0 ? (
        <div className="space-y-2">
          <h3 className="field-label">风险提示</h3>
          <ul className="space-y-1.5">
            {result.risks.map((risk) => (
              <li key={risk} className="flex gap-2 text-sm leading-relaxed text-ink-300">
                <span aria-hidden className="text-honey-400">
                  !
                </span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tracking && symbol !== null ? (
        <TargetTracker
          symbol={symbol}
          referencePrice={plan?.referencePrice ?? result.price ?? 0}
          targetPct={result.targetPct}
          onStop={() => setTracking(false)}
        />
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
            {detail !== null && detail.notes.length > 0 ? (
              <ul className="space-y-1">
                {detail.notes.map((note) => (
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
        <button
          type="button"
          onClick={() => {
            if (tracking) {
              setTracking(false);
              return;
            }
            requestNotifications();
            setTracking(true);
          }}
          disabled={blocked}
          className="flex-1 rounded-2xl bg-mint-500 px-5 py-3 text-sm font-semibold text-night-950 transition-colors disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-ink-400"
        >
          {tracking ? "停止追踪" : "开始追踪"}
        </button>
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
        {onRescan !== undefined ? (
          <button
            type="button"
            onClick={onRescan}
            disabled={rescanning}
            className="flex-1 rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-ink-200 disabled:text-ink-500"
          >
            {rescanning ? "重新扫描中…" : "重新扫描"}
          </button>
        ) : null}
      </div>
    </motion.section>
  );
}
