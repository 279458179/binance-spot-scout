/**
 * End-to-end coverage of the one decision the product exists to make.
 *
 * The Worker API is intercepted, so these tests assert the UI contract — which
 * card appears for which decision, and what the visitor can do next — without
 * depending on live market conditions.
 */

import { expect, test, type Page } from "@playwright/test";

import type { ScanPayload, ScanResult, SymbolDetail } from "../src/shared/types";

const GENERATED_AT = new Date().toISOString();

/** A tradable candidate, shaped exactly like the Worker's payload. */
function entryNowResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    status: "BUY_NOW",
    symbol: "SUIUSDT",
    baseAsset: "SUI",
    price: 3.37,
    score: 81,
    targetPct: 5,
    marketRegime: "RISK_ON",
    reasons: ["15m 回踩 EMA21 后重新站稳", "成交量放大 1.8 倍"],
    risks: ["距离短线压力位约 3.8%"],
    metrics: {
      rsi15m: 61,
      rsi1h: 58,
      volumeRatio: 1.8,
      spreadPct: 0.12,
      atrPct: 0.9,
    },
    plan: {
      referencePrice: 3.37,
      entryZoneLow: 3.32,
      entryZoneHigh: 3.39,
      pullbackPrice: 3.3,
      target3Pct: 3.4711,
      target5Pct: 3.5385,
      invalidation: 3.11,
      riskReward: 1.55,
    },
    generatedAt: GENERATED_AT,
    strategyVersion: "1.0.0",
    ...overrides,
  };
}

function payloadFor(result: ScanResult): ScanPayload {
  return {
    result,
    diagnostics: {
      universeCount: 412,
      liquidityFilterCount: 103,
      technicalScanCount: 103,
      deepScanCount: 15,
      candidateCount: 1,
      topCandidate: result.symbol,
      topScore: result.score,
      scanDurationMs: 5_400,
      dataTimestamp: Date.parse(GENERATED_AT),
      providerErrors: [],
      topCandidates: [],
    },
    cached: false,
  };
}

/** The per-symbol deep dive `/api/symbol/:symbol` returns, shaped like the real route. */
function symbolDetailFor(symbol: string, score: number): SymbolDetail {
  return {
    symbol,
    generatedAt: GENERATED_AT,
    marketRegime: "RISK_ON",
    metrics15m: null,
    metrics1h: null,
    metrics5m: null,
    metrics4h: null,
    ticker: null,
    book: null,
    supportResistance: null,
    score: {
      trend: 22,
      momentum: 15,
      volume: 12,
      entry: 13,
      liquidity: 9,
      riskReward: 7,
      market: 5,
      penalty: 3,
      total: score,
    },
    riskGate: { passed: true, violations: [], reasons: [], warnings: [] },
    patterns: [],
    notes: ["1h 结构完整", "15m 回踩 EMA21 后重新站稳"],
  };
}

/**
 * Answers every API call with the supplied decision.
 *
 * Each route must return its own real shape: the detail route is a different
 * payload from the scan route, and serving one for the other is what a
 * well-meaning mock gets wrong.
 */
async function mockApi(page: Page, result: ScanResult): Promise<void> {
  const payload = payloadFor(result);
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/history")) {
      await route.fulfill({ status: 200, json: { ok: true, entries: [] } });
      return;
    }
    if (url.includes("/api/symbol/")) {
      const symbol = decodeURIComponent(url.split("/api/symbol/")[1]?.split("?")[0] ?? "SUIUSDT");
      await route.fulfill({ status: 200, json: symbolDetailFor(symbol, result.score) });
      return;
    }
    await route.fulfill({ status: 200, json: payload });
  });
}

test.describe("home", () => {
  test("shows a candidate with its score, plan and reasons", async ({ page }) => {
    await mockApi(page, entryNowResult());
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("SUI / USDT");
    await expect(page.getByText("SUI", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("81", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("15m 回踩 EMA21 后重新站稳")).toBeVisible();

    const target = page.getByText("+5%", { exact: false }).first();
    await expect(target).toBeVisible();
  });

  test("expands the score breakdown on demand", async ({ page }) => {
    await mockApi(page, entryNowResult());
    await page.goto("/");

    const toggle = page.getByRole("button", { name: "查看评分拆解" });
    await expect(toggle).toBeVisible();
    await toggle.click();

    await expect(page.getByRole("button", { name: "收起评分拆解" })).toBeVisible();
    // The detail payload must actually render, not silently fall back to empty.
    await expect(page.getByText("1h 结构完整")).toBeVisible();
  });

  test("starts live tracking and offers Binance plus a rescan", async ({ page }) => {
    await mockApi(page, entryNowResult());
    await page.goto("/");

    const exchangeLink = page.getByRole("link", { name: "打开 Binance" });
    await expect(exchangeLink).toBeVisible();
    // The handoff must point at the candidate's own spot pair.
    await expect(exchangeLink).toHaveAttribute("href", /SUI_USDT/);
    // A rescan affordance appears both on the card and in the page CTA.
    await expect(page.getByRole("button", { name: "重新扫描" }).first()).toBeVisible();
  });

  test("does not invent a symbol when scanning is halted", async ({ page }) => {
    await mockApi(
      page,
      entryNowResult({
        status: "MARKET_HALT",
        symbol: null,
        baseAsset: null,
        price: null,
        score: 0,
        reasons: ["本次扫描没有标的达到 5M USDT 的 24 小时成交额下限"],
        metrics: null,
        plan: null,
      }),
    );
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "市场停扫" })).toBeVisible();
    await expect(page.getByText("本次扫描没有标的达到 5M USDT 的 24 小时成交额下限")).toBeVisible();
    await expect(page.getByText("成交额下限")).toBeVisible();
    // The empty state must not fall back to a candidate card.
    await expect(page.getByRole("link", { name: "打开 Binance" })).toHaveCount(0);
  });

  test("shows the wait-for-pullback state for a stretched but healthy name", async ({ page }) => {
    await mockApi(
      page,
      entryNowResult({
        status: "BUY_ON_PULLBACK",
        score: 76,
        reasons: ["15m RSI 偏高，等回踩 EMA21 更合适"],
      }),
    );
    await page.goto("/");

    await expect(page.getByText("76", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("回踩", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "打开 Binance" })).toHaveCount(1);
  });

  test("renders without a React error on a detail payload missing optional fields", async ({
    page,
  }) => {
    const renderErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("spot-scout")) {
        renderErrors.push(message.text());
      }
    });

    await mockApi(page, entryNowResult());
    await page.goto("/");
    await page.getByRole("button", { name: "查看评分拆解" }).click();
    await expect(page.getByRole("button", { name: "收起评分拆解" })).toBeVisible();

    expect(renderErrors).toEqual([]);
  });

  test("surfaces a data-unavailable failure instead of a stale recommendation", async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      await route.fulfill({
        status: 502,
        json: {
          ok: false,
          error: "DATA_UNAVAILABLE",
          message: "行情源暂时不可用，请稍后重试",
          code: "DATA_UNAVAILABLE",
        },
      });
    });
    await page.goto("/");

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("行情源");
  });
});

test.describe("navigation", () => {
  test("moves between radar, history and about", async ({ page }) => {
    await mockApi(page, entryNowResult());
    await page.goto("/");

    await page.getByRole("link", { name: "历史" }).click();
    await expect(page).toHaveURL(/\/history$/);

    await page.getByRole("link", { name: "说明" }).click();
    await expect(page).toHaveURL(/\/about$/);
  });
});
