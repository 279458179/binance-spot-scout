import type { ReactNode } from "react";

export function ScanProgress({ diagnostics }: { diagnostics?: { universeCount: number; liquidityFilterCount: number; technicalScanCount: number; deepScanCount: number; candidateCount: number } }): ReactNode {
  const stages = diagnostics ? [
    `${diagnostics.universeCount} 个交易对`,
    `${diagnostics.liquidityFilterCount} 个满足流动性`,
    `${diagnostics.technicalScanCount} 个技术候选`,
    `${diagnostics.deepScanCount} 个深度分析`,
    `${diagnostics.candidateCount} 个最终候选`,
  ] : ["分析流动性", "比较趋势", "检查入场结构", "评估风险"];
  return (
    <div aria-live="polite" className="rounded-[var(--radius-xl)] border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3"><span className="size-2 animate-pulse rounded-full bg-[var(--brand-primary)]" /><p className="text-sm font-medium">正在扫描市场</p></div>
      <ol className="mt-5 space-y-3 text-sm text-[var(--text-secondary)]">{stages.map((stage) => <li key={stage}>{stage}</li>)}</ol>
    </div>
  );
}
