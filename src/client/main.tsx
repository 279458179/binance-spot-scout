import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";

import "@/client/styles/global.css";
import { ErrorBoundary } from "@/client/components/ErrorBoundary";
import { Layout } from "@/client/components/Layout";
import { AboutPage } from "@/client/pages/AboutPage";
import { DebugPage } from "@/client/pages/DebugPage";
import { HistoryPage } from "@/client/pages/HistoryPage";
import { HomePage } from "@/client/pages/HomePage";
import { ResearchPage } from "@/client/pages/ResearchPage";

/** Fallback screen for unknown routes. */
function NotFoundPage() {
  return (
    <section className="rounded-2xl border border-white/5 bg-night-900/60 p-6 text-center">
      <p className="text-4xl" aria-hidden>
        🐾
      </p>
      <h1 className="mt-3 text-lg font-semibold">这里没有猫</h1>
      <p className="mt-2 text-sm text-ink-400">你访问的页面不存在。</p>
      <Link
        to="/"
        className="mt-5 inline-block rounded-full bg-mint-500/15 px-4 py-2 text-sm text-mint-300 transition-colors hover:bg-mint-500/25"
      >
        回到首页
      </Link>
    </section>
  );
}

const container = document.getElementById("root");

if (!container) {
  throw new Error("#root container is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="research" element={<ResearchPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="debug" element={<DebugPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
