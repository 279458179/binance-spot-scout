import { Hono } from "hono";
import type { Env } from "../env";
import type { GridMarket } from "@/shared/grid";
import { buildApiError } from "./api-error";
import { rateLimit } from "@/lib/rate-limit";
import { readGridResearch, validGridSymbol } from "../services/grid-market";

export const gridRoute = new Hono<{ Bindings: Env }>();

/** Public research only; never accepts keys, signatures or order instructions. */
gridRoute.get("/:symbol", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "anonymous";
  if (!rateLimit("grid", ip, 30, 60_000)) {
    return c.json(buildApiError("INVALID_REQUEST", "请求过于频繁，请稍后刷新"), 429);
  }
  const symbol = c.req.param("symbol");
  const market = c.req.query("market") ?? "spot";
  const rawBudget = c.req.query("budget") ?? "50";
  const budget = Number(rawBudget);
  if (!validGridSymbol(symbol) || (market !== "spot" && market !== "futures") ||
      !/^\d+(\.\d{1,2})?$/.test(rawBudget) ||
      !Number.isFinite(budget) || budget < 10 || budget > 1_000_000) {
    return c.json(buildApiError("INVALID_REQUEST", "仅支持 BTC/ETH/SOL USDT，预算须在 10～1000000 USDT"), 400);
  }
  try {
    const analysis = await readGridResearch(symbol, market as GridMarket, budget);
    c.header("Cache-Control", "no-store");
    return c.json({ ok: true, analysis });
  } catch (error) {
    console.warn("网格行情读取失败", error instanceof Error ? error.message : String(error));
    return c.json(buildApiError("DATA_UNAVAILABLE", "当前交易市场行情不可用，已暂停给出网格参数"), 503);
  }
});
