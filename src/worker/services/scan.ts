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
 * Logs the funnel summary every scan must report (spec #68).
 *
 * Kept to counts, identifiers and durations: no credentials, no request bodies.
 * A single structured line is far easier to filter in Workers Logs than several
 * free-text ones, and it is emitted on the failure path too so a scan that threw
 * is still traceable.
 */
function logScanSummary(payload: ScanPayload, elapsedMs: number): void {
  const { result, diagnostics } = payload;
  console.log(
    JSON.stringify({
      event: "scan.completed",
      universeSize: diagnostics.universeCount,
      filteredSize: diagnostics.liquidityFilterCount,
      technicalSize: diagnostics.technicalScanCount,
      deepScanSize: diagnostics.deepScanCount,
      candidateCount: diagnostics.candidateCount,
      topCandidate: diagnostics.topCandidate,
      topScore: diagnostics.topScore,
      result: result.status,
      symbol: result.symbol,
      marketRegime: result.marketRegime,
      providerErrors: diagnostics.providerErrors.length,
      durationMs: Math.round(elapsedMs),
      scanDurationMs: diagnostics.scanDurationMs,
      strategyVersion: result.strategyVersion,
    }),
  );
}

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
  const startedAt = Date.now();
  console.log(JSON.stringify({ event: "scan.started" }));

  try {
    const payload = await runScan(client);
    logScanSummary(payload, Date.now() - startedAt);
    return payload;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "scan.failed",
        durationMs: Math.round(Date.now() - startedAt),
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  }
}
