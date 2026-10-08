import { expect, test, type Page } from "@playwright/test";
import type { GridAnalysis } from "../src/shared/grid";

function candidate(): GridAnalysis {
  return {
    symbol: "BTCUSDT", market: "spot", decision: "CANDIDATE",
    kind: "现货网格", generatedAt: new Date().toISOString(), price: 82000,
    change24hPct: 0.5, adx1h: 13.2, adx4h: 12.8, atr1hPct: 0.7,
    fundingRatePct: null, score: 80,
    reasons: ["震荡行情通过过滤"], dataSource: "Binance Global Spot",
    notice: "仅供研究。",
    plan: {
      lower: 79000, upper: 85000, count: 10, spacing: "等差",
      grossStepPct: 0.7, estimatedNetStepPct: 0.44, roundTripCostPct: 0.26,
      assumedMinOrderUsdt: 8, budgetUsdt: 100, assumedLeverage: 1,
      perGridNotionalUsdt: 10, invalidation: "跌破区间需重新评估",
    },
  };
}
async function mockApi(page: Page): Promise<void> {
  await page.route("**/api/grid/**", async (route) => {
    const request = route.request().url();
    if (request.includes("market=futures")) {
      await route.fulfill({
        status: 503, json: { ok: false, error: "DATA_UNAVAILABLE", message: "合约行情不可用" },
      });
      return;
    }
    await route.fulfill({ status: 200, json: { ok: true, analysis: candidate() } });
  });
}

test.describe("grid radar", () => {
  test("shows a candidate with bounded plan on the new route", async ({ page }) => {
    await mockApi(page);
    await page.goto("/grid");
    await expect(page.getByRole("heading", { name: "网格机会，不必硬凑。" })).toBeVisible();
    await expect(page.getByText("网格研究候选")).toBeVisible();
    await expect(page.getByText("79,000")).toBeVisible();
    await expect(page.getByText("85,000")).toBeVisible();
    await expect(page.getByText("震荡行情通过过滤")).toBeVisible();
  });
  test("clears old candidate when futures market is unavailable", async ({ page }) => {
    await mockApi(page);
    await page.goto("/grid");
    await expect(page.getByText("网格研究候选")).toBeVisible();
    await page.getByRole("button", { name: "U 本位合约 / 合约网格" }).click();
    await expect(page.getByRole("alert")).toContainText("合约行情不可用");
    await expect(page.getByText("79,000")).toHaveCount(0);
    await expect(page.getByText("网格研究候选")).toHaveCount(0);
  });
});
