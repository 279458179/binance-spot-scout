/**
 * Service wrapper around the scan orchestrator.
 *
 * Keeping client construction here means the routes never talk to Binance
 * directly and the same wiring is reused by the cron handler.
 */

import { runScan } from "@/strategy";

import type { ScanPayload } from "@/shared/types";

import { createMarketClient } from "./market-client";

/**
 * Run one full market scan against the live Binance REST API.
 *
 * `baseUrlsVar` is the optional `BINANCE_BASE_URLS` binding; when omitted the
 * client falls back to the shipped venue list.
 *
 * Throws a `BinanceError` when the scan cannot produce a usable payload;
 * routes translate that into a `DATA_UNAVAILABLE` response envelope.
 */
export async function scanMarket(baseUrlsVar?: string): Promise<ScanPayload> {
  const client = createMarketClient(baseUrlsVar);

  return runScan(client);
}
