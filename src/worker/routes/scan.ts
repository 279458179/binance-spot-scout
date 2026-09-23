import { Hono } from "hono";
import { SCAN_CONFIG } from "@/config/strategy";
import { readLatestScan, writeLatestScan } from "@/lib/cache";
import { insertScan } from "@/lib/db";
import type { ScanPayload } from "@/shared/types";
import type { Env } from "../env";
import { rateLimit } from "@/lib/rate-limit";
import { scanWithSingleFlight } from "../services/scan-flight";

export const scanRoute = new Hono<{ Bindings: Env }>();

/** Runs a manual scan, reusing the cached snapshot inside the cooldown window. */
scanRoute.post("/", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "anonymous";
  if (!rateLimit("scan", ip, 10, 60_000)) {
    return c.json({ ok: false, error: "RATE_LIMITED", message: "请求太频繁了，缓一小会儿再试 🐾" }, 429);
  }

  const cached = await readLatestScan(c.env.SCAN_CACHE);
  if (cached) {
    const ageMs = Date.now() - new Date(cached.result.generatedAt).getTime();
    if (Number.isFinite(ageMs) && ageMs < SCAN_CONFIG.manualScanCooldownMs) {
      const payload: ScanPayload = { ...cached, cached: true };
      return c.json(payload);
    }
  }

  const fresh = await scanWithSingleFlight(c.env.BINANCE_BASE_URLS);
  await writeLatestScan(c.env.SCAN_CACHE, fresh);

  try {
    await insertScan(c.env.DB, fresh);
  } catch (error) {
    console.warn("写入扫描历史失败", error);
  }

  const payload: ScanPayload = { ...fresh, cached: false };
  return c.json(payload);
});
