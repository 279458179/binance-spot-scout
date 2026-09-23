import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { useHistory } from "@/client/hooks/useHistory";
import { SkeletonRows } from "@/client/components/Skeleton";
import { DecisionBadge } from "@/client/components/v11/DecisionBadge";
import { staggerList, listItem } from "@/client/animations/variants";
import {
  formatDateTime,
  formatPrice,
  formatScore,
  formatSymbolPair,
} from "@/client/lib/format";
import type { HistoryEntry } from "@/shared/types";

function asPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function asHit(value: boolean | null | undefined): string {
  return value === true ? "HIT" : value === false ? "未中" : "待定";
}

export function HistoryPage(): ReactNode {
  const { entries, error, loading, reload } = useHistory(20);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-6">
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[2rem] font-semibold leading-tight text-[var(--text-primary)]">
            历史时间线
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
            展开每一次决策，查看入场、目标与实际表现。仅供复盘参考，不构成投资建议。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] transition duration-300 hover:border-[rgba(255,255,255,.18)] hover:text-[var(--text-primary)]"
        >
          刷新
        </button>
      </header>

      {error === null ? null : (
        <p role="alert" className="mb-3 text-xs text-[var(--accent-danger)]">
          {error}
        </p>
      )}

      {loading ? (
        <SkeletonRows rows={5} />
      ) : entries.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center text-sm text-[var(--text-secondary)] backdrop-blur-xl">
          还没有历史记录，先去首页扫一次吧。
        </div>
      ) : (
        <motion.div
          variants={staggerList}
          initial="hidden"
          animate="show"
          className="relative flex flex-col gap-4 pl-5 before:absolute before:inset-y-2 before:left-[7px] before:w-px before:bg-[linear-gradient(to_bottom,transparent,var(--border)_12%,var(--border)_88%,transparent)] sm:pl-8"
        >
          {entries.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </motion.div>
      )}
    </section>
  );
}

interface HistoryRowProps {
  entry: HistoryEntry;
}

function HistoryRow({ entry }: HistoryRowProps): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const outcome = entry.outcome;

  return (
    <motion.li variants={listItem} className="relative">
      <span
        aria-hidden
        className="absolute -left-5 top-6 h-2.5 w-2.5 rounded-full border border-[rgba(255,255,255,.24)] bg-[var(--accent)] shadow-[0_0_0_5px_rgba(52,217,154,.08)] sm:-left-8"
      />
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className="w-full rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-5 text-left backdrop-blur-xl transition duration-300 hover:border-[rgba(255,255,255,.16)] hover:bg-[var(--surface-elevated)]"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="tabular text-sm font-medium text-[var(--text-secondary)]">
            {formatDateTime(entry.createdAt)}
          </span>
          <span className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            {entry.symbol === null ? "全场观望" : formatSymbolPair(entry.symbol)}
          </span>
          <DecisionBadge status={entry.status} />
          <span className="tabular ml-auto text-xl font-semibold text-[var(--accent)]">
            {formatScore(entry.score)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-[rgba(52,217,154,.1)] px-3 py-1 font-semibold text-[#8df5c4]">
            +5% {asHit(outcome?.target5Hit)}
          </span>
          <span className="rounded-full bg-[rgba(245,181,68,.1)] px-3 py-1 font-semibold text-[#ffd479]">
            +3% {asHit(outcome?.target3Hit)}
          </span>
          <span className="tabular ml-auto text-[var(--text-secondary)]">
            MFE {asPct(outcome?.mfePct)} · MAE {asPct(outcome?.maePct)}
          </span>
        </div>

        {expanded ? (
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4 text-xs sm:grid-cols-4">
            <HistoryMetric label="Entry" value={entry.price === null ? "—" : formatPrice(entry.price)} />
            <HistoryMetric label="Target" value={entry.targetPrice === null ? "—" : formatPrice(entry.targetPrice)} />
            <HistoryMetric label="失效" value={entry.invalidationPrice === null ? "—" : formatPrice(entry.invalidationPrice)} />
            <HistoryMetric label="MFE" value={asPct(outcome?.mfePct)} />
            <HistoryMetric label="MAE" value={asPct(outcome?.maePct)} />
            <HistoryMetric label="1h" value={outcome?.price1h == null ? "—" : formatPrice(outcome.price1h)} />
            <HistoryMetric label="6h" value={outcome?.price6h == null ? "—" : formatPrice(outcome.price6h)} />
            <HistoryMetric label="24h" value={outcome?.price24h == null ? "—" : formatPrice(outcome.price24h)} />
          </div>
        ) : null}
      </button>
    </motion.li>
  );
}

function HistoryMetric({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="rounded-[var(--radius-sm)] bg-[var(--surface-elevated)] px-3 py-2">
      <div className="text-[10px] font-semibold tracking-[0.1em] text-[var(--text-secondary)] uppercase">
        {label}
      </div>
      <div className="tabular mt-1 text-sm font-medium text-[var(--text-primary)]">{value}</div>
    </div>
  );
}
