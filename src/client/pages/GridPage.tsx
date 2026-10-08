import { useEffect, useState, type ReactNode } from "react";
import { describeError, fetchGridAnalysis } from "@/client/lib/api";
import type { GridAnalysis, GridMarket } from "@/shared/grid";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
const BUTTON = "rounded-full px-4 py-2.5 text-sm font-medium transition-colors";
function money(number: number | null): string {
  return number === null ? "—" : number.toLocaleString("en-US", { maximumFractionDigits: 6 });
}
function pct(number: number | null): string {
  return number === null ? "—" : number.toFixed(2) + "%";
}
function Stat({ label, value }: { label: string; value: string }): ReactNode {
  return <div className="rounded-2xl bg-[var(--bg-secondary)] p-4">
    <dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
    <dd className="mt-2 text-lg font-semibold tabular">{value}</dd>
  </div>;
}

export function GridPage(): ReactNode {
  const [symbol, setSymbol] = useState<(typeof SYMBOLS)[number]>("BTCUSDT");
  const [market, setMarket] = useState<GridMarket>("spot");
  const [budgetText, setBudgetText] = useState("50");
  const [refreshKey, setRefreshKey] = useState(0);
  const [analysis, setAnalysis] = useState<GridAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const budget = Number(budgetText);
  const valid = /^\d+(\.\d{1,2})?$/.test(budgetText) &&
    Number.isFinite(budget) && budget >= 10 && budget <= 1_000_000;

  useEffect(() => {
    if (!valid) {
      setError("预算须为 10～1000000 USDT，最多两位小数");
      setAnalysis(null);
      setLoading(false);
      return;
    }
    let alive = true;
    const load = () => {
      setLoading(true);
      void fetchGridAnalysis(symbol, market, budget)
        .then((result) => {
          if (!alive) return;
          setAnalysis(result.analysis);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (!alive) return;
          setAnalysis(null);
          setError(describeError(cause));
        })
        .finally(() => { if (alive) setLoading(false); });
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [symbol, market, budget, valid, refreshKey]);

  const status = analysis?.decision === "CANDIDATE" ? "网格研究候选" :
    analysis?.decision === "WATCH" ? "仅观察趋势" :
    analysis?.decision === "AVOID" ? "不建议此时开网格" : "数据不可用";
  const tag = analysis?.decision === "CANDIDATE"
    ? "bg-[var(--success-bg)] text-[var(--success)]"
    : analysis?.decision === "WATCH"
      ? "bg-[var(--warning-bg)] text-[var(--warning)]"
      : "bg-[var(--neutral-bg)] text-[var(--neutral)]";

  return <section className="space-y-7" aria-label="网格交易机会雷达">
    <header className="space-y-3">
      <span className="inline-flex rounded-full bg-[rgba(0,113,227,.08)] px-3 py-1 text-xs font-semibold text-[var(--brand-primary)]">Grid Radar · 只读研究</span>
      <h1 className="text-[clamp(1.9rem,5vw,3rem)] font-semibold tracking-[-.04em]">网格机会，不必硬凑。</h1>
      <p className="max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">现货和 U 本位合约分开分析。低趋势震荡行情才研究网格，上涨、下跌趋势明显时宁可观望，也不强行推荐开仓。</p>
    </header>
    <div className="panel space-y-5 p-5 sm:p-7">
      <div className="flex flex-wrap gap-2" role="group" aria-label="选择币种">
        {SYMBOLS.map((value) => <button type="button" key={value} aria-pressed={symbol === value}
          onClick={() => { setAnalysis(null); setSymbol(value); }}
          className={BUTTON + (symbol === value ? " bg-[var(--text-primary)] text-white" : " bg-[var(--bg-secondary)] text-[var(--text-secondary)]")}>
          {value.replace("USDT", "")}</button>)}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="选择市场">
          {(["spot", "futures"] as const).map((value) =>
            <button key={value} type="button" aria-pressed={market === value} onClick={() => { setAnalysis(null); setMarket(value); }}
              className={BUTTON + (market === value ? " bg-[rgba(0,113,227,.1)] text-[var(--brand-primary)]" : " bg-[var(--bg-secondary)] text-[var(--text-secondary)]")}>
              {value === "spot" ? "现货 / 现货网格" : "U 本位合约 / 合约网格"}</button>)}
        </div>
        <label className="ml-auto flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
          研究预算（USDT）
          <input aria-label="研究预算（USDT）" value={budgetText}
            onChange={(event) => { setAnalysis(null); setBudgetText(event.target.value); }}
            inputMode="decimal" className="w-36 rounded-xl border border-[var(--border-soft)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)]" />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--divider)] pt-4">
        <span className="text-xs text-[var(--text-tertiary)]">页面打开时每 60 秒自动刷新 · 不连接交易账户</span>
        <button type="button" disabled={loading || !valid} onClick={() => { setAnalysis(null); setRefreshKey((v) => v + 1); }}
          className="rounded-full bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? "分析中…" : "刷新行情"}</button>
      </div>
    </div>

    {error !== null && <div className="panel p-5 text-sm text-[var(--danger)]" role="alert">{error}；不会展示过期下单参数。</div>}
    {loading && analysis === null && error === null &&
      <div className="panel p-10 text-center text-sm text-[var(--text-secondary)]">正在分析已收盘 K 线与市场波动…</div>}
    {analysis !== null && error === null && <article className="panel space-y-6 p-5 sm:p-8" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--text-secondary)]">{analysis.symbol} · {analysis.dataSource}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{analysis.kind}</h2>
        </div>
        <span className={"rounded-full px-4 py-2 text-sm font-semibold " + tag}>{status}</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="参考价格（USDT）" value={money(analysis.price)} />
        <Stat label="24h 涨跌" value={pct(analysis.change24hPct)} />
        <Stat label="1h / 4h ADX" value={analysis.adx1h === null ? "—" : analysis.adx1h + " / " + analysis.adx4h} />
        <Stat label="1h ATR 波动" value={pct(analysis.atr1hPct)} />
      </dl>
      {market === "futures" && <p className="text-sm text-[var(--text-secondary)]">最近公开资金费率：{analysis.fundingRatePct === null ? "—" : analysis.fundingRatePct.toFixed(4) + "%"}（不代表后续费率）</p>}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">判定依据</h3>
        <ul className="list-inside list-disc space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
          {analysis.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      </section>
      {analysis.plan !== null && <section className="rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--bg-secondary)] p-5">
        <h3 className="mb-4 font-semibold">研究参数 · 非即时下单指令</h3>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="区间下限 USDT" value={money(analysis.plan.lower)} />
          <Stat label="区间上限 USDT" value={money(analysis.plan.upper)} />
          <Stat label="格数 / 类型" value={analysis.plan.count + " 格 / " + analysis.plan.spacing} />
          <Stat label="单格毛间距" value={pct(analysis.plan.grossStepPct)} />
          <Stat label="假设成本后单格间距" value={pct(analysis.plan.estimatedNetStepPct)} />
          <Stat label="每格假设名义金额" value={money(analysis.plan.perGridNotionalUsdt) + " U"} />
        </dl>
        <p className="mt-4 text-xs leading-6 text-[var(--text-secondary)]">单格成本假设（双边手续费+滑点）：{pct(analysis.plan.roundTripCostPct)}；每格名义额 8U 仅为简化估算。合约使用 {analysis.plan.assumedLeverage}x 名义仓位进行估算，不是推荐杠杆。实际最小订单和交易成本需在平台核实。</p>
        <p className="mt-3 text-sm leading-6 text-[var(--danger)]">失效条件：{analysis.plan.invalidation}</p>
      </section>}
      <footer className="border-t border-[var(--divider)] pt-4 text-xs leading-6 text-[var(--text-tertiary)]">
        <p>采样时间：{new Date(analysis.generatedAt).toLocaleString("zh-CN")} · 规则评分不等于获利概率。</p>
        <p>{analysis.notice} 当前尚无订单级回测与样本外净收益验证。</p>
      </footer>
    </article>}
  </section>;
}
