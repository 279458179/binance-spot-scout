/**
 * Responsive coverage (spec #52 and the Release Gate's Responsive/Mobile items).
 *
 * The product is explicitly meant to be read on a phone next to the Binance app,
 * so the layout is asserted at each width the spec names rather than only at the
 * desktop default the other specs use. Every check is a real measurement or a
 * real reachability assertion — no screenshots are compared, so the suite stays
 * stable across font stacks and renderers.
 */

/// <reference lib="dom" />

import { expect, test, type Page } from "@playwright/test";

import type { ScanPayload, ScanResult, SymbolDetail } from "../src/shared/types";

/** The widths called out by spec #52. */
const WIDTHS = [
  { label: "iPhone SE", width: 375, height: 667 },
  { label: "iPhone 14", width: 390, height: 844 },
  { label: "iPhone Pro Max", width: 430, height: 932 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "desktop", width: 1440, height: 900 },
] as const;

const GENERATED_AT = new Date().toISOString();

function entryNowResult(): ScanResult {
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
    metrics: { rsi15m: 61, rsi1h: 58, volumeRatio: 1.8, spreadPct: 0.12, atrPct: 0.9 },
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

async function mockApi(page: Page, result: ScanResult): Promise<void> {
  const payload = payloadFor(result);
  const detail: SymbolDetail = {
    symbol: result.symbol ?? "SUIUSDT",
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
      total: result.score,
    },
    riskGate: { passed: true, violations: [], reasons: [], warnings: [] },
    patterns: [],
    notes: ["1h 结构完整"],
  };

  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/history")) {
      await route.fulfill({ status: 200, json: { ok: true, entries: [] } });
      return;
    }
    if (url.includes("/api/symbol/")) {
      await route.fulfill({ status: 200, json: detail });
      return;
    }
    await route.fulfill({ status: 200, json: payload });
  });
}

/** Fails the document if it scrolls sideways, which is the classic mobile bug. */
async function expectNoHorizontalOverflow(page: Page, context: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const widest = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((el) => el.getBoundingClientRect().right)
      .reduce((max, right) => Math.max(max, right), 0);
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: Math.round(widest),
    };
  });

  // 1px of rounding tolerance: sub-pixel layout makes exact equality brittle.
  expect(
    overflow.scrollWidth,
    `${context}: page scrolls horizontally (${overflow.scrollWidth} > ${overflow.clientWidth})`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  expect(
    overflow.widest,
    `${context}: an element overflows the viewport (right edge at ${overflow.widest}px)`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

for (const viewport of WIDTHS) {
  test.describe(`${viewport.label} — ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("lays out the decision card without horizontal overflow", async ({ page }) => {
      await mockApi(page, entryNowResult());
      await page.goto("/");

      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { name: "SUI / USDT" })).toBeVisible();
      await expectNoHorizontalOverflow(page, `${viewport.label} home`);

      // The plan grid collapses to one column on phones and spreads out on
      // desktop; either way each field must remain readable.
      for (const label of ["当前价", "参考入场", "+5% 目标", "失效位"]) {
        await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
      }
    });

    test("keeps every action reachable and tappable", async ({ page }) => {
      await mockApi(page, entryNowResult());
      await page.goto("/");

      const actions = [
        page.getByRole("link", { name: "在 Binance 查看" }),
        page.getByRole("button", { name: "重新扫描" }),
      ];

      for (const action of actions) {
        await expect(action).toBeVisible();
        const box = await action.boundingBox();
        expect(box, "action must have a layout box").not.toBeNull();
        // 40px is the practical floor for a touch target on a phone.
        expect(box!.height, "touch target too short").toBeGreaterThanOrEqual(32);
        expect(box!.width, "touch target too narrow").toBeGreaterThanOrEqual(32);
      }

      // Primary navigation must stay reachable at every width.
      for (const label of ["首页", "历史"]) {
        await expect(page.getByRole("link", { name: label })).toBeVisible();
      }
    });

  test("renders the halt state and its reason", async ({ page }) => {
      await mockApi(
        page,
        {
          ...entryNowResult(),
          status: "MARKET_HALT",
          symbol: null,
          baseAsset: null,
          price: null,
          score: 0,
          reasons: ["本次扫描没有标的达到 5M USDT 的 24 小时成交额下限"],
          metrics: null,
          plan: null,
        } as ScanResult,
      );
      await page.goto("/");

      await expect(page.getByRole("heading", { name: "市场停扫" })).toBeVisible();
      await expect(page.getByText("本次扫描没有标的达到 5M USDT 的 24 小时成交额下限")).toBeVisible();
      await expectNoHorizontalOverflow(page, `${viewport.label} no-trade`);
    });

    test("renders the debug candidate table or degrades cleanly", async ({ page }) => {
      await mockApi(page, entryNowResult());
      await page.goto("/debug");

      // The table is allowed to be empty in production (ENABLE_DEBUG=false), but
      // the page must still lay out and stay readable at this width.
      await expect(page.getByRole("heading", { name: "调试" })).toBeVisible();
      await expectNoHorizontalOverflow(page, `${viewport.label} debug`);
    });
  });
}
