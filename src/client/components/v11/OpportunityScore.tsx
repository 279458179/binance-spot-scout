import type { ReactNode } from "react";

export function OpportunityScore({ score, confidence }: { score: number; confidence?: string }): ReactNode {
  const label = confidence === "HIGH" ? "高" : confidence === "MEDIUM" ? "中" : "低";
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs text-[var(--text-secondary)]">Opportunity Score</p>
      <p className="mt-1 flex items-baseline gap-1 tabular text-3xl font-semibold text-[var(--text-primary)]">
        {Math.round(score)}
        <span className="text-sm font-normal text-[var(--text-secondary)]">/ 100</span>
      </p>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">置信度 · {label}</p>
    </div>
  );
}
