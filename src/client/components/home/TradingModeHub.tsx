import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fetchGridAnalysis } from "@/client/lib/api";
import type { GridAnalysis, GridMarket } from "@/shared/grid";

type PreviewState = { value: GridAnalysis | null; error: boolean; loading: boolean };
type Mode = {
  title: string;
  code: string;
  subtitle: string;
  detail: string;
  href: string;
  accent: string;
};
const MODES: readonly Mode[] = [
  {
    title: "现货精选", code: "01 · SPOT", subtitle: "单币买入研究",
    detail: "原有 Top 1 选币策略，继续保留入场条件、目标位与风险闸门。",
    href: "#spot-scout", accent: "text-[#0071e3]",
  },
  {
    title: "合约行情", code: "02 · FUTURES", subtitle: "趋势与风险观察",
    detail: "独立读取 U 本位合约行情，识别趋势强度与资金费率；不自动下单。",
    href: "/grid?market=futures&focus=trend", accent: "text-[#8c58c6]",
  },
  {
    title: "现货网格", code: "03 · SPOT GRID", subtitle: "震荡区间机会",
    detail: "根据波动、流动性和交易成本，研究上下限、等差或等比及格数。",
    href: "/grid?market=spot", accent: "text-[#16865a]",
  },
  {
    title: "合约网格", code: "04 · FUTURES GRID", subtitle: "中性网格机会",
    detail: "增加资金费率、强趋势过滤与杠杆风险说明，符合条件才给参数。",
    href: "/grid?market=futures", accent: "text-[#d38221]",
  },
];
function label(value: GridAnalysis | null, error: boolean, loading: boolean): string {
  if (loading) return "分析中";
  if (error || !value) return "公开行情暂不可用";
  if (value.decision === "CANDIDATE") return "发现网格研究候选";
  if (value.decision === "WATCH") return "趋势观察 · 暂不开网格";
  if (value.decision === "AVOID") return "当前不宜开网格";
  return "数据暂不可用";
}
function MiniPulse({ market, state }: { market: GridMarket; state: PreviewState }): ReactNode {
  const value = state.value;
  const candidate = value?.decision === "CANDIDATE";
  return <Link
    to={"/grid?market=" + market}
    aria-label={(market === "spot" ? "BTC 现货网格" : "BTC 合约网格") + "分析详情"}
    className="group rounded-[20px] border border-[var(--border-soft)] bg-white px-5 py-4 transition-all hover:border-[rgba(0,113,227,.25)] hover:shadow-[0_8px_24px_rgba(0,0,0,.05)]"
  >
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{market === "spot" ? "BTC · 现货" : "BTC · U 本位合约"}</span>
      <span className="text-sm text-[var(--brand-primary)]" aria-hidden="true">↗</span>
    </div>
    <p className={"mt-2 text-[14px] font-semibold " + (candidate ? "text-[var(--success)]" : "text-[var(--text-primary)]")}>
      {label(value, state.error, state.loading)}
    </p>
    <p className="mt-1 text-xs tabular text-[var(--text-tertiary)]">
      {value?.price ? value.price.toLocaleString("en-US", { maximumFractionDigits: 4 }) + " USDT" : "—"} · {state.loading ? "正在拉取数据" : value?.adx1h !== null && value?.adx1h !== undefined ? "ADX " + value.adx1h : "暂无强度数据"}
    </p>
  </Link>;
}

export function TradingModeHub(): ReactNode {
  const [reload, setReload] = useState(0);
  const [spot, setSpot] = useState<PreviewState>({ value: null, error: false, loading: true });
  const [futures, setFutures] = useState<PreviewState>({ value: null, error: false, loading: true });
  useEffect(() => {
    let mounted = true;
    setSpot({ value: null, loading: true, error: false });
    setFutures({ value: null, loading: true, error: false });
    const read = (market: GridMarket) => {
      void fetchGridAnalysis("BTCUSDT", market, 50)
        .then((response) => {
          if (!mounted) return;
          const valid = response.analysis &&
            ["CANDIDATE", "WATCH", "AVOID", "UNAVAILABLE"].includes(response.analysis.decision);
          const next = { value: valid ? response.analysis : null, error: !valid, loading: false };
          if (market === "spot") setSpot(next);
          else setFutures(next);
        })
        .catch(() => {
          if (!mounted) return;
          const next = { value: null, error: true, loading: false };
          if (market === "spot") setSpot(next);
          else setFutures(next);
        });
    };
    read("spot");
    read("futures");
    return () => { mounted = false; };
  }, [reload]);

  return <section className="space-y-5" aria-label="交易策略工作台">
    <div className="relative overflow-hidden rounded-[28px] border border-[var(--border-soft)] bg-white px-6 pb-7 pt-8 shadow-[0_12px_50px_rgba(15,23,42,.045)] sm:px-9 sm:pt-10">
      <div className="pointer-events-none absolute right-0 top-0 size-48 rounded-full bg-[radial-gradient(circle,rgba(0,113,227,.09),transparent_67%)]" />
      <div className="relative space-y-3">
        <p className="text-xs font-semibold tracking-[.19em] text-[var(--brand-primary)]">SPOT SCOUT / STRATEGY HUB</p>
        <h2 className="max-w-3xl text-[clamp(1.9rem,4.3vw,2.7rem)] font-semibold leading-[1.2] tracking-[-.048em]">一次看懂行情，再决定是否交易。</h2>
        <p className="max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">四个研究入口，优先考虑网格。趋势不适合时就观望，不为了凑信号而开仓。所有建议仅使用公开行情，不连接你的交易账户。</p>
      </div>
      <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MODES.map((mode) => <Link key={mode.code} to={mode.href}
          className="group flex min-h-44 flex-col rounded-[20px] border border-[var(--border-soft)] bg-[var(--bg-tertiary)] p-5 transition-all hover:-translate-y-0.5 hover:border-[rgba(0,113,227,.25)] hover:bg-white hover:shadow-[0_12px_36px_rgba(0,0,0,.07)] focus-visible:outline-2">
          <div className="flex items-center justify-between gap-2">
            <p className={"text-[10px] font-bold tracking-[.14em] " + mode.accent}>{mode.code}</p>
            <span aria-hidden="true" className="text-[var(--text-tertiary)] transition-transform group-hover:translate-x-1">→</span>
          </div>
          <h3 className="mt-4 text-[19px] font-semibold tracking-tight">{mode.title}</h3>
          <p className="mt-0.5 text-xs font-medium text-[var(--text-secondary)]">{mode.subtitle}</p>
          <p className="mt-3 text-xs leading-5 text-[var(--text-tertiary)]">{mode.detail}</p>
        </Link>)}
      </div>
    </div>
    <div className="panel space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--brand-primary)]">GRID WATCH</p>
          <h3 className="mt-1 text-lg font-semibold">BTC 网格行情快照</h3>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">分别读取现货和合约公开数据；只有符合条件才展示候选。不代表盈利概率。</p>
        </div>
        <button type="button" onClick={() => setReload((value) => value + 1)}
          disabled={spot.loading || futures.loading}
          className="rounded-full border border-[var(--border-soft)] bg-white px-4 py-2 text-xs font-medium text-[var(--brand-primary)] disabled:opacity-50">
          重新检查
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <MiniPulse market="spot" state={spot} />
        <MiniPulse market="futures" state={futures} />
      </div>
      <p className="text-xs text-[var(--text-tertiary)]">快照在首次打开及手动点击时更新；持续提醒需配置服务端 Telegram 推送。</p>
    </div>
  </section>;
}
