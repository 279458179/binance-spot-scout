import type { ReactNode } from "react";
import { STATUS_LABELS } from "@/client/lib/labels";
import type { ScanStatus } from "@/shared/types";

const STYLES: Record<ScanStatus, string> = {
  BUY_NOW: "bg-[var(--success-bg)] text-[var(--success)]",
  BUY_ON_PULLBACK: "bg-[var(--warning-bg)] text-[var(--warning)]",
  WATCH_ONLY: "bg-[var(--neutral-bg)] text-[var(--neutral)]",
  MARKET_HALT: "bg-[var(--danger-bg)] text-[var(--danger)]",
};

export function DecisionBadge({ status }: { status: ScanStatus }): ReactNode {
  return (
    <span className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ${STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
