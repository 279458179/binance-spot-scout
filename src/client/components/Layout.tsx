import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { NavLink } from "react-router-dom";

import { AppHeader } from "@/client/components/v11/AppHeader";

/** App shell: brand header, normal document flow footer and persistent disclaimer. */
export function Layout(): ReactNode {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-page)] text-[var(--text-primary)]">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <Outlet />
      </main>
      <footer className="border-t border-[var(--divider)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-[var(--text-tertiary)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>仅为行情研究工具，不构成投资建议。</span>
          <nav className="flex gap-4" aria-label="次级导航">
            <NavLink to="/about">说明</NavLink>
            <NavLink to="/debug">调试</NavLink>
          </nav>
        </div>
      </footer>
    </div>
  );
}
