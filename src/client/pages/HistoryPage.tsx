import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useHistory } from "@/client/hooks/useHistory";
import { SkeletonRows } from "@/client/components/Skeleton";
import { staggerList, listItem } from "@/client/animations/variants";
import {
  formatDateTime,
  formatPrice,
  formatScore,
  formatSymbolPair,
} from "@/client/lib/format";
import { STATUS_LABELS } from "@/client/lib/labels";
import type { HistoryEntry, ScanStatus } from "@/shared/types";

const STATUS_TONES: Record<ScanStatus, string> = {
  ENTRY_NOW: "bg-mint-950 text-mint-300",
  WAIT_PULLBACK: "bg-honey-950 text-honey-300",
  NO_TRADE: "bg-white/5 text-ink-200",
};

export function HistoryPage(): ReactNode {
  const { entries, error, loading, reload } = useHistory(20);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-100">历史记录</h1>
          <p className="mt-1 text-xs text-ink-400">
            最近 20 次扫描结果，仅供复盘参考，不构成投资建议。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="shrink-0 rounded-full border border-night-600 px-3 py-1 text-xs text-ink-300 transition hover:border-ink-400 hover:text-ink-100"
        >
          刷新
        </button>
      </header>

      {error === null ? null : (
        <p role="alert" className="mb-3 text-xs text-coral-400">
          {error}
        </p>
      )}

      {loading ? (
        <SkeletonRows rows={5} />
      ) : entries.length === 0 ? (
        <div className="panel px-4 py-10 text-center text-sm text-ink-400">
          还没有历史记录，先去首页扫一次吧。
        </div>
      ) : (
        <motion.ul
          variants={staggerList}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-2"
        >
          {entries.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </motion.ul>
      )}
    </section>
  );
}

interface HistoryRowProps {
  entry: HistoryEntry;
}

function HistoryRow({ entry }: HistoryRowProps): ReactNode {
  return (
    <motion.li variants={listItem} className="panel px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tabular text-sm font-semibold text-ink-100">
          {entry.symbol === null ? "全场观望" : formatSymbolPair(entry.symbol)}
        </span>
        <span className={`pill ${STATUS_TONES[entry.status]}`}>
          {STATUS_LABELS[entry.status]}
        </span>
        <span className="tabular ml-auto text-sm text-ink-300">
          综合评分 {formatScore(entry.score)} / 100
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-400">
        <span className="tabular">{formatDateTime(entry.createdAt)}</span>
        <span className="tabular">
          现价 {entry.price === null ? "—" : formatPrice(entry.price)}
        </span>
        <span className="tabular">
          目标 {entry.targetPrice === null ? "—" : formatPrice(entry.targetPrice)}
        </span>
        <span className="tabular">
          失效{" "}
          {entry.invalidationPrice === null
            ? "—"
            : formatPrice(entry.invalidationPrice)}
        </span>
      </div>
    </motion.li>
  );
}
