import { writeLatestScan } from "@/lib/cache";
import { insertScan } from "@/lib/db";
import type { Env } from "./env";
import { scanMarket } from "./services/scan";

/**
 * Cron handler: refreshes the cached scan snapshot and appends it to D1 history.
 * Failures are logged only — a broken run must never crash the scheduled event.
 */
export async function scheduled(_event: unknown, env: Env, _ctx: unknown): Promise<void> {
  try {
    const payload = await scanMarket();
    await writeLatestScan(env.SCAN_CACHE, payload);
    await insertScan(env.DB, payload);
  } catch (error) {
    console.error("定时扫描失败", error);
  }
}
