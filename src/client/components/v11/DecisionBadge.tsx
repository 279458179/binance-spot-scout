import type { ReactNode } from "react";
import { STATUS_LABELS } from "@/client/lib/labels";
import type { ScanStatus } from "@/shared/types";

const STYLES: Record<ScanStatus, string> = {
  BUY_NOW: "bg-[rgba(52,217,154,.14)] text-[#6ff0b4]",
  BUY_ON_PULLBACK: "bg-[rgba(245,181,68,.13)] text-[#ffd479]",
  WATCH_ONLY: "bg-[rgba(139,149,168,.14)] text-[#c7cedb]",
  MARKET_HALT: "bg-[rgba(242,99,127,.13)] text-[#ff9aae]",
};

export function DecisionBadge({ status }: { status: ScanStatus }): ReactNode {
  return (
    <span className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-bold tracking-[0.08em] uppercase ${STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
