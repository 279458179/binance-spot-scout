import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

function navClass(isActive: boolean): string {
  const base = "rounded-full px-3 py-1.5 text-xs transition-colors sm:text-sm";
  return isActive
    ? `${base} bg-[rgba(52,217,154,.13)] text-[#6ff0b4]`
    : `${base} text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]`;
}

export function AppHeader(): ReactNode {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[rgba(5,5,6,.76)] backdrop-blur-[var(--blur)]">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <NavLink to="/" className="flex min-w-0 items-center gap-2.5">
          <svg aria-hidden viewBox="0 0 48 32" className="h-7 w-10">
            <path d="M7 22C7 12 15 5 24 5s17 7 17 17" fill="none" stroke="#6ff0b4" strokeLinecap="round" strokeWidth="2.5" opacity=".82" />
            <path d="M15 22c0-5 4-9 9-9" fill="none" stroke="rgba(245,245,247,.36)" strokeLinecap="round" strokeWidth="2" />
            <circle cx="24" cy="23" r="3.2" fill="#6ff0b4" />
            <path d="M9 6L13 1M39 6L35 1" fill="none" stroke="rgba(245,245,247,.78)" strokeLinecap="round" strokeWidth="2.5" />
          </svg>
          <span className="truncate text-sm font-semibold tracking-tight sm:text-base">
            币喵雷达<span className="text-[var(--text-secondary)]"> · Spot Scout</span>
          </span>
        </NavLink>
        <nav className="ml-auto flex items-center gap-1 overflow-x-auto" aria-label="主导航">
          {[["/", "首页"], ["/history", "历史"], ["/research", "研究"], ["/about", "说明"], ["/debug", "调试"]].map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => navClass(isActive)}>
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
