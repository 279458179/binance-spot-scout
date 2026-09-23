import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useLatestScan } from "@/client/hooks/useLatestScan";
import { SkeletonRows } from "@/client/components/Skeleton";
import { fadeInUp } from "@/client/animations/variants";
import { describeError, fetchHealth } from "@/client/lib/api";
import { formatAge, formatClockMs, formatDateTime } from "@/client/lib/format";
import { STATUS_LABELS, funnelLabel } from "@/client/lib/labels";
import type { HealthPayload } from "@/shared/types";

export function DebugPage(): ReactNode {
  const { data, error, loading, reload } = useLatestScan();
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const payload = await fetchHealth();
        if (!cancelled) {
          setHealth(payload);
        }
      } catch (cause) {
        if (!cancelled) {
          setHealthError(describeError(cause));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const diagnostics = data?.diagnostics;
  /**
   * `topCandidates` was added after the first deploy, and the KV cache serves the
   * newest scan for up to 30 minutes. A payload written by the previous revision
   * therefore reaches this page without the field, so it is read defensively
   * rather than assumed.
   */
  const topCandidates = diagnostics?.topCandidates ?? [];
  const dataTimestamp = diagnostics?.dataTimestamp ?? 0;
  const stages = [
    { stage: "universe", count: diagnostics?.universeCount },
    { stage: "liquidity", count: diagnostics?.liquidityFilterCount },
    { stage: "technical", count: diagnostics?.technicalScanCount },
    { stage: "deep", count: diagnostics?.deepScanCount },
    { stage: "candidate", count: diagnostics?.candidateCount },
  ];

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">调试</h1>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            漏斗数据与运行状态，仅用于开发排查。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="shrink-0 rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs text-[var(--text-secondary)] transition hover:border-[var(--text-quaternary)] hover:text-[var(--text-primary)]"
        >
          刷新
        </button>
      </header>

      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        className="panel px-4 py-4"
      >
        <p className="field-label">服务健康</p>
        {healthError === null ? null : (
          <p role="alert" className="mt-2 text-xs text-[var(--danger)]">
            {healthError}
          </p>
        )}
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="field-label">状态</p>
            <p className="field-value mt-1">
              {health === null ? "—" : health.ok ? "正常" : "异常"}
            </p>
          </div>
          <div>
            <p className="field-label">策略版本</p>
            <p className="field-value mt-1">{health?.strategyVersion ?? "—"}</p>
          </div>
          <div>
            <p className="field-label">服务时间</p>
            <p className="field-value mt-1">
              {health?.time === undefined ? "—" : formatDateTime(health.time)}
            </p>
          </div>
        </div>
      </motion.div>

      {error === null ? null : (
        <p role="alert" className="mt-4 text-xs text-[var(--danger)]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-4">
          <SkeletonRows rows={4} />
        </div>
      ) : diagnostics === undefined ? (
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="panel mt-4 px-4 py-6 text-center"
        >
          <p className="text-sm text-[var(--text-secondary)]">调试模式未开启</p>
          <p className="mt-2 text-xs leading-5 text-[var(--text-tertiary)]">
            服务端需要设置环境变量 <code className="text-[var(--text-secondary)]">ENABLE_DEBUG=true</code>{" "}
            后重新扫描，才会返回漏斗诊断数据。评分与结果本身不受影响。
          </p>
        </motion.div>
      ) : (
        <>
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            className="panel mt-4 px-4 py-4"
          >
            <p className="field-label">漏斗</p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
              {stages.map((item) => (
                <li key={item.stage} className="tabular">
                  <span className="text-[var(--text-quaternary)]">{funnelLabel(item.stage)}</span>{" "}
                  <span className="text-[var(--text-primary)]">
                    {item.count === undefined ? "—" : item.count}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            className="panel mt-3 px-4 py-4"
          >
            <p className="field-label">本次扫描</p>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="field-label">Top 候选</p>
                <p className="field-value mt-1">
                  {diagnostics.topCandidate ?? "—"}
                </p>
              </div>
              <div>
                <p className="field-label">Top 评分</p>
                <p className="field-value mt-1">
                  {diagnostics.topScore === null
                    ? "—"
                    : diagnostics.topScore.toFixed(1)}
                </p>
              </div>
              <div>
                <p className="field-label">耗时</p>
                <p className="field-value mt-1">
                  {diagnostics.scanDurationMs} ms
                </p>
              </div>
              <div>
                <p className="field-label">数据时间</p>
                <p className="field-value mt-1">
                  {dataTimestamp === 0
                    ? "—"
                    : formatAge(Date.now() - dataTimestamp)}
                </p>
              </div>
            </div>
            {dataTimestamp === 0 ? null : (
              <p className="tabular mt-2 text-xs text-[var(--text-quaternary)]">
                采集于 {formatClockMs(dataTimestamp)}
              </p>
            )}
          </motion.div>

          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            className="panel mt-3 px-4 py-4"
          >
            <p className="field-label">内部候选 Top {topCandidates.length}</p>
            {topCandidates.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                本次没有标的通过初筛，明细为空。
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-xs">
                  <thead>
                    <tr className="text-[var(--text-quaternary)]">
                      <th scope="col" className="py-1 pr-2 font-medium">标的</th>
                      <th scope="col" className="py-1 pr-2 text-right font-medium">评分</th>
                      <th scope="col" className="py-1 pr-2 text-right font-medium">扣分</th>
                      <th scope="col" className="py-1 pr-2 font-medium">结果</th>
                      <th scope="col" className="py-1 font-medium">原因 / 未入选理由</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCandidates.map((entry) => (
                      <tr key={entry.symbol} className="border-t border-[var(--divider)] align-top">
                        <td className="tabular py-1.5 pr-2 text-[var(--text-primary)]">{entry.symbol}</td>
                        <td className="tabular py-1.5 pr-2 text-right text-[var(--text-secondary)]">
                          {entry.score === null ? "—" : entry.score.toFixed(1)}
                        </td>
                        <td className="tabular py-1.5 pr-2 text-right text-[var(--warning)]">
                          {entry.penalty === null || entry.penalty === 0
                            ? "—"
                            : `-${entry.penalty.toFixed(1)}`}
                        </td>
                        <td className="py-1.5 pr-2 text-[var(--text-secondary)]">
                          {entry.status === null ? "未评分" : STATUS_LABELS[entry.status]}
                        </td>
                        <td className="py-1.5 text-[var(--text-tertiary)]">
                          {[entry.rejectReason, ...entry.reasons]
                            .filter((line): line is string => line !== null && line.length > 0)
                            .join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>

          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            className="panel mt-3 px-4 py-4"
          >
            <p className="field-label">数据源错误</p>
            {diagnostics.providerErrors.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--text-tertiary)]">本次没有数据源报错。</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1 text-xs text-[var(--danger)]">
                {diagnostics.providerErrors.map((message) => (
                  <li key={message} className="break-all">
                    · {message}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </>
      )}
    </section>
  );
}
