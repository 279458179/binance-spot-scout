import type { ReactNode } from "react";

export function OpportunityScore({ score, confidence }: { score: number; confidence?: string }): ReactNode {
  const label = confidence === "HIGH" ? "高" : confidence === "MEDIUM" ? "中" : "低";
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--bg-secondary)] p-5">
      <p className="text-sm text-[var(--text-secondary)]">机会评分</p>
      <p className="mt-1 flex items-baseline gap-1 tabular text-3xl font-semibold text-[var(--text-primary)]">
        {Math.round(score)}
        <span className="text-sm font-normal text-[var(--text-secondary)]">/ 100</span>
      </p>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">置信度 · {label}</p>
    </div>
  );
}
