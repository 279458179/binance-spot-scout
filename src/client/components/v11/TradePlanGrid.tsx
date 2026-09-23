import type { ReactNode } from "react";
import { formatPrice } from "@/client/lib/format";
import type { TradePlan } from "@/shared/types";

export function TradePlanGrid({ plan }: { plan: TradePlan }): ReactNode {
  const items = [
    ["当前价", plan.referencePrice],
    ["参考入场", plan.entryZoneLow],
    ["+5% 目标", plan.target5Pct],
    ["失效位", plan.invalidation],
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-[var(--radius-lg)] bg-[var(--bg-secondary)] p-5">
          <dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
          <dd className="mt-1 tabular text-lg font-semibold">{formatPrice(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
