import { readLatestScan, writeLatestScan } from "@/lib/cache";
import { insertScan } from "@/lib/db";
import { SCAN_CONFIG } from "@/config/strategy";
import type { Env } from "./env";
import { scanMarket } from "./services/scan";

/**
 * Cron handler: refreshes the cached scan snapshot and appends it to D1 history.
 * Failures are logged only — a broken run must never crash the scheduled event.
 */
export async function scheduled(_event: unknown, env: Env, _ctx: unknown): Promise<void> {
  try {
    const cached = await readLatestScan(env.SCAN_CACHE);
    if (cached) {
      const ageMs = Date.now() - new Date(cached.result.generatedAt).getTime();
      if (Number.isFinite(ageMs) && ageMs < SCAN_CONFIG.manualScanCooldownMs) return;
    }

    const payload = await scanMarket(env.BINANCE_BASE_URLS);
    await writeLatestScan(env.SCAN_CACHE, payload);
    await insertScan(env.DB, payload);
  } catch (error) {
    console.error("定时扫描失败", error);
  }
}
