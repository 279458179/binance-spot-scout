/**
 * Service wrapper around the scan orchestrator.
 *
 * Keeping client construction here means the routes never talk to Binance
 * directly and the same wiring is reused by the cron handler.
 */

import { createBinanceMarketClient } from "@/lib/binance";
import { runScan } from "@/strategy";

import type { ScanPayload } from "@/shared/types";

/**
 * Run one full market scan against the live Binance REST API.
 *
 * Throws a `BinanceError` when the scan cannot produce a usable payload;
 * routes translate that into a `DATA_UNAVAILABLE` response envelope.
 */
export async function scanMarket(): Promise<ScanPayload> {
  const client = createBinanceMarketClient();

  return runScan(client);
}
