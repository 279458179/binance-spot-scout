import type { ReactNode } from "react";

export function ScanProgress({ diagnostics }: { diagnostics?: { universeCount: number; liquidityFilterCount: number; technicalScanCount: number; deepScanCount: number; candidateCount: number } }): ReactNode {
  const stages = diagnostics ? [
    `${diagnostics.universeCount} 个交易对`,
    `${diagnostics.liquidityFilterCount} 个满足流动性`,
    `${diagnostics.technicalScanCount} 个技术候选`,
    `${diagnostics.deepScanCount} 个深度分析`,
    `${diagnostics.candidateCount} 个最终候选`,
  ] : ["读取行情数据", "按流动性与资讯排序", "比较技术结构", "检查风险与入场", "从摇币机取出 Top 1"];
  return (
    <div aria-live="polite" className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-center gap-3"><span className="size-2 animate-pulse rounded-full bg-[var(--accent)]" /><p className="text-sm font-medium">摇币机正在选币</p></div>
      <ol className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">{stages.map((stage) => <li key={stage}>· {stage}</li>)}</ol>
    </div>
  );
}
