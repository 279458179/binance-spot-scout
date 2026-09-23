import { Hono } from "hono";
import { readLatestScan, writeLatestScan } from "@/lib/cache";
import type { ScanPayload } from "@/shared/types";
import type { Env } from "../env";
import { scanWithSingleFlight } from "../services/scan-flight";

export const latestRoute = new Hono<{ Bindings: Env }>();

/** Returns the latest scan snapshot, falling back to a fresh scan on cache miss. */
latestRoute.get("/", async (c) => {
  const cached = await readLatestScan(c.env.SCAN_CACHE);
  if (cached) {
    const payload: ScanPayload = { ...cached, cached: true };
    return c.json(payload);
  }

  const fresh = await scanWithSingleFlight(c.env.BINANCE_BASE_URLS);
  await writeLatestScan(c.env.SCAN_CACHE, fresh);
  const payload: ScanPayload = { ...fresh, cached: false };
  return c.json(payload);
});
