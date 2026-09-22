import { Hono } from "hono";
import { SCAN_CONFIG } from "@/config/strategy";
import { readLatestScan, writeLatestScan } from "@/lib/cache";
import { insertScan } from "@/lib/db";
import type { ScanPayload } from "@/shared/types";
import type { Env } from "../env";
import { scanMarket } from "../services/scan";

export const scanRoute = new Hono<{ Bindings: Env }>();

/** Runs a manual scan, reusing the cached snapshot inside the cooldown window. */
scanRoute.post("/", async (c) => {
  const cached = await readLatestScan(c.env.SCAN_CACHE);
  if (cached) {
    const ageMs = Date.now() - new Date(cached.result.generatedAt).getTime();
    if (Number.isFinite(ageMs) && ageMs < SCAN_CONFIG.manualScanCooldownMs) {
      const payload: ScanPayload = { ...cached, cached: true };
      return c.json(payload);
    }
  }

  const fresh = await scanMarket(c.env.BINANCE_BASE_URLS);
  await writeLatestScan(c.env.SCAN_CACHE, fresh);

  try {
    await insertScan(c.env.DB, fresh);
  } catch (error) {
    console.warn("写入扫描历史失败", error);
  }

  const payload: ScanPayload = { ...fresh, cached: false };
  return c.json(payload);
});
