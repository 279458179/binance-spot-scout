import type { ReactNode } from "react";

import { SCORE_ITEMS } from "@/client/lib/labels";
import { formatScore } from "@/client/lib/format";
import type { ScoreBreakdown as ScoreBreakdownValue } from "@/shared/types";

interface ScoreBreakdownProps {
  score: ScoreBreakdownValue | null;
}

/** Renders the seven weighted score items plus any risk penalty. */
export function ScoreBreakdown({ score }: ScoreBreakdownProps): ReactNode {
  if (score === null) {
    return (
      <p className="text-sm text-[var(--text-tertiary)]">评分拆解暂不可用。</p>
    );
  }

  return (
    <div className="space-y-3">
      {SCORE_ITEMS.map((item) => {
        const value = score[item.key];
        const ratio = Math.max(0, Math.min(1, value / item.max));

        return (
          <div key={item.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-[var(--text-secondary)]">{item.label}</span>
              <span className="tabular text-[var(--text-tertiary)]">
                {formatScore(value)}
                <span className="text-[var(--text-quaternary)]"> / {item.max}</span>
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(0,0,0,0.06)]">
              <div
                className="h-full rounded-full bg-[var(--success)]"
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
          </div>
        );
      })}

      {score.penalty > 0 ? (
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-[var(--danger)]">风险扣分</span>
          <span className="tabular text-[var(--danger)]">
            -{formatScore(score.penalty)}
          </span>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between border-t border-[var(--divider)] pt-3 text-sm font-semibold">
        <span>综合评分</span>
        <span className="tabular text-[var(--text-primary)]">
          {formatScore(score.total)}
          <span className="text-[var(--text-tertiary)]"> / 100</span>
        </span>
      </div>
    </div>
  );
}
