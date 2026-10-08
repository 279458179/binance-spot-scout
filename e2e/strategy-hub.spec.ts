import { expect, test, type Page } from "@playwright/test";
import type { GridAnalysis } from "../src/shared/grid";

const sample = (market: "spot" | "futures"): GridAnalysis => ({
  symbol: "BTCUSDT",
  market,
  decision: market === "spot" ? "CANDIDATE" : "AVOID",
  kind: market === "spot" ? "现货网格" : "合约中性网格",
  generatedAt: new Date().toISOString(),
  price: 82000,
  change24hPct: 0.4,
  adx1h: 18,
  adx4h: 19,
  atr1hPct: 0.3,
  fundingRatePct: market === "futures" ? 0.004 : null,
  score: market === "spot" ? 75 : 15,
  reasons: ["规则筛选结果"],
  plan: market === "spot" ? {
    lower: 80000, upper: 84000, count: 10, spacing: "等差",
    grossStepPct: 0.5, estimatedNetStepPct: 0.24, roundTripCostPct: 0.26,
    assumedMinOrderUsdt: 8, budgetUsdt: 100, assumedLeverage: 1,
    perGridNotionalUsdt: 10, invalidation: "突破时重新评估",
  } : null,
  dataSource: market === "spot" ? "Binance Global Spot" : "Binance USD-M Futures",
  notice: "只读研究",
});
async function installRoutes(page: Page): Promise<void> {
  await page.route("**/api/grid/**", async (route) => {
    const market = new URL(route.request().url()).searchParams.get("market") === "futures" ? "futures" : "spot";
    await route.fulfill({ status: 200, json: { ok: true, analysis: sample(market) } });
  });
  await page.route("**/api/latest", async (route) => {
    await route.fulfill({
      status: 503,
      json: { ok: false, error: "DATA_UNAVAILABLE", message: "选币行情源不可用" },
    });
  });
}

test.describe("home four-mode strategy hub", () => {
  test("prominently exposes all four strategies and live market summaries", async ({ page }) => {
    await installRoutes(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "一次看懂行情，再决定是否交易。" })).toBeVisible();
    for (const name of ["现货精选", "合约行情", "现货网格", "合约网格"]) {
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }
    await expect(page.getByText("发现网格研究候选")).toBeVisible();
    await expect(page.getByText("当前不宜开网格")).toBeVisible();
    await expect(page.getByRole("heading", { name: "现货单币精选" })).toBeVisible();
  });

  test("futures mode deep-link shows futures analysis context and keeps old spot off-screen", async ({ page }) => {
    await installRoutes(page);
    await page.goto("/");
    await page.getByRole("heading", { name: "合约行情" }).click();
    await expect(page).toHaveURL(/\/grid\?market=futures&focus=trend/);
    await expect(page.getByRole("heading", { name: "合约趋势与风险观察。" })).toBeVisible();
    await expect(page.getByText("Binance USD-M Futures")).toBeVisible();
    await expect(page.getByText("区间下限 USDT")).toHaveCount(0);
  });

  test("grid cards link to the correct market-specific analysis", async ({ page }) => {
    await installRoutes(page);
    await page.goto("/");
    await page.getByRole("heading", { name: "现货网格" }).click();
    await expect(page).toHaveURL(/\/grid\?market=spot/);
    await expect(page.getByText("Binance Global Spot")).toBeVisible();
    await page.getByRole("button", { name: "U 本位合约 / 合约网格" }).click();
    await expect(page).toHaveURL(/market=futures/);
    await expect(page.getByText("Binance USD-M Futures")).toBeVisible();
    await expect(page.getByText("区间下限 USDT")).toHaveCount(0);
  });
});
