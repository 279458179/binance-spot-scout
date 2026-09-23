import type { ReactNode } from "react";

export function WhyThisCoin({ reasons }: { reasons: readonly string[] }): ReactNode {
  if (reasons.length === 0) return null;
  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="text-sm font-semibold">为什么是它</h3>
      <ul className="mt-3 space-y-2">{reasons.map((reason) => <li key={reason} className="text-sm text-[var(--text-secondary)]">{reason}</li>)}</ul>
    </section>
  );
}

export function RiskInsights({ risks }: { risks: readonly string[] }): ReactNode {
  if (risks.length === 0) return null;
  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="text-sm font-semibold">需要注意什么</h3>
      <ul className="mt-3 space-y-2">{risks.slice(0, 4).map((risk) => <li key={risk} className="text-sm text-[var(--text-secondary)]">{risk}</li>)}</ul>
    </section>
  );
}
