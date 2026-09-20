import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { useNow } from "@/client/hooks/useNow";
import { formatClockMs } from "@/client/lib/format";

const NAV_ITEMS: { to: string; label: string }[] = [
  { to: "/", label: "首页" },
  { to: "/history", label: "历史" },
  { to: "/about", label: "说明" },
  { to: "/debug", label: "调试" },
];

function navClass(isActive: boolean): string {
  const base =
    "rounded-full px-3 py-1.5 text-sm transition-colors sm:px-4 sm:py-2";
  return isActive
    ? `${base} bg-mint-500/15 text-mint-300`
    : `${base} text-ink-300 hover:bg-white/5 hover:text-ink-100`;
}

/** App shell: brand header, bottom nav and a persistent disclaimer. */
export function Layout(): ReactNode {
  const now = useNow(1000);

  return (
    <div className="flex min-h-screen flex-col bg-night-950 text-ink-100">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-night-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2">
            <span aria-hidden className="text-xl">
              🐱
            </span>
            <span className="text-sm font-semibold tracking-tight sm:text-base">
              币喵雷达
              <span className="text-ink-400"> · Spot Scout</span>
            </span>
          </NavLink>
          <span className="tabular hidden text-xs text-ink-400 sm:block">
            {formatClockMs(now)}
          </span>
        </div>
        <nav className="mx-auto flex max-w-3xl items-center gap-1 px-4 pb-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => navClass(isActive)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-5">
        <Outlet />
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-10 border-t border-white/5 bg-night-950/90 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3 text-center text-[11px] leading-relaxed text-ink-400 sm:text-xs">
          仅为行情研究工具，不构成投资建议 · 不接入下单权限 · 请自行承担风险
        </div>
      </footer>
    </div>
  );
}
