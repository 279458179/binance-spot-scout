import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { fetchResearch } from "@/client/lib/api";
import { STATUS_LABELS } from "@/client/lib/labels";
import type { ResearchReport } from "@/shared/types";

const WINDOWS = [
  { days: 7, label: "过去 7 天" },
  { days: 30, label: "过去 30 天" },
] as const;

function pct(value: number | null): string {
  return value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function ResearchPage(): ReactNode {
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchResearch()
      .then((body) => {
        if (!mounted) return;
        setReports(body.reports);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (mounted) setError(cause instanceof Error ? cause.message : "研究报告读取失败");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">研究</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">真实历史样本统计，不把小样本包装成胜率。</p>
      </header>
      {loading ? <div className="panel px-5 py-10 text-center text-sm text-[var(--text-secondary)]">正在读取研究数据…</div> : null}
      {error !== null ? <p role="alert" className="panel px-4 py-3 text-sm text-[#ff9aae]">{error}</p> : null}
      {!loading && error === null ? WINDOWS.map(({ days, label }) => {
        const report = reports.find((item) => item.days === days);
        return (
          <section key={days} className="panel space-y-4 p-5">
            <h2 className="text-lg font-semibold">{label}</h2>
            {report?.windows.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">样本积累中</p> : null}
            <div className="space-y-3">
              {(report?.windows ?? []).map((window) => (
                <article key={window.status} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
                  <header className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{STATUS_LABELS[window.status]}</h3>
                    <span className={`text-xs ${window.sampleSize < 30 ? "text-[var(--accent-warm)]" : "text-[var(--text-secondary)]"}`}>
                      n={window.sampleSize}
                    </span>
                  </header>
                  {window.sampleSize < 30 ? <p className="mt-2 text-xs text-[var(--accent-warm)]">样本积累中</p> : null}
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><dt className="text-xs text-[var(--text-secondary)]">+5% Hit</dt><dd className="tabular">{window.sampleSize < 30 || window.hit5Pct === null ? "—" : `${window.hit5Pct.toFixed(1)}%`}</dd></div>
                    <div><dt className="text-xs text-[var(--text-secondary)]">Median MFE</dt><dd className="tabular">{pct(window.medianMfePct)}</dd></div>
                    <div><dt className="text-xs text-[var(--text-secondary)]">Median MAE</dt><dd className="tabular">{pct(window.medianMaePct)}</dd></div>
                    <div><dt className="text-xs text-[var(--text-secondary)]">24h Return</dt><dd className="tabular">{pct(window.medianReturn24hPct)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        );
      }) : null}
    </section>
  );
}
