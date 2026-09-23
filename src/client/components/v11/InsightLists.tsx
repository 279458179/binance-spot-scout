import type { ReactNode } from "react";

export function WhyThisCoin({ reasons }: { reasons: readonly string[] }): ReactNode {
  if (reasons.length === 0) return null;
  return (
    <section className="border-t border-[var(--divider)] pt-7">
      <h3 className="text-[20px] font-semibold tracking-tight">为什么是它</h3>
      <ul className="mt-3 space-y-2">{reasons.map((reason) => <li key={reason} className="text-sm text-[var(--text-secondary)]">{reason}</li>)}</ul>
    </section>
  );
}

export function RiskInsights({ risks }: { risks: readonly string[] }): ReactNode {
  if (risks.length === 0) return null;
  return (
    <section className="border-t border-[var(--divider)] pt-7">
      <h3 className="text-[20px] font-semibold tracking-tight">需要注意</h3>
      <ul className="mt-3 space-y-2">{risks.slice(0, 4).map((risk) => <li key={risk} className="text-sm text-[var(--text-secondary)]">{risk}</li>)}</ul>
    </section>
  );
}
