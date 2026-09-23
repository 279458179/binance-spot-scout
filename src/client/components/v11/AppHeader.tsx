import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { LogoMark } from "@/client/components/brand/LogoMark";

function navClass(isActive: boolean): string {
  const base = "rounded-full px-3 py-1.5 text-sm transition-colors";
  return isActive
    ? `${base} bg-[rgba(0,113,227,.09)] font-medium text-[var(--brand-primary)]`
    : `${base} text-[var(--text-secondary)] hover:bg-[rgba(0,0,0,.035)] hover:text-[var(--text-primary)]`;
}

export function AppHeader(): ReactNode {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--divider)] bg-[var(--surface-frosted)] backdrop-blur-[var(--blur)] backdrop-saturate-180">
      <div className="mx-auto flex h-[52px] max-w-6xl items-center gap-4 px-4 sm:px-6">
        <NavLink to="/" className="flex min-w-0 items-center gap-2.5">
          <LogoMark className="size-7" />
          <span className="truncate text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
            币喵雷达
            <span className="ml-1.5 hidden text-[13px] font-normal text-[var(--text-tertiary)] sm:inline">
              Spot Scout
            </span>
          </span>
        </NavLink>
        <nav className="ml-auto flex items-center gap-1 overflow-x-auto" aria-label="主导航">
          {[["/", "首页"], ["/history", "历史"], ["/research", "研究"]].map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => navClass(isActive)}>
              {label}
            </NavLink>
          ))}
          <span className="ml-2 hidden items-center gap-2 rounded-full bg-[var(--bg-secondary)] px-3 py-1.5 text-xs text-[var(--text-secondary)] md:inline-flex">
            <span aria-hidden className="size-1.5 rounded-full bg-[var(--success)]" />
            行情在线
          </span>
        </nav>
      </div>
    </header>
  );
}
