import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";

import { AppHeader } from "@/client/components/v11/AppHeader";

/** App shell: brand header, bottom nav and a persistent disclaimer. */
export function Layout(): ReactNode {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--text-primary)]">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-5">
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
