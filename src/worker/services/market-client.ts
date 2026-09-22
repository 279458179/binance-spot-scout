/**
 * Builds the market-data client every Worker route shares.
 *
 * The venue list is overridable through the `BINANCE_BASE_URLS` var so an
 * operator can point a deployment at a mirror without touching code. See
 * `src/config/api.ts` for why `api.binance.us` is present by default: Binance
 * refuses requests from whole datacenter IP ranges, so a Cloudflare-hosted
 * deployment can only reach the US venue.
 */

import { BINANCE_REST_BASE_URLS } from "@/config/api";
import { createBinanceMarketClient } from "@/lib/binance";

/** Splits a comma-separated var into a clean host list, or null when unset. */
function parseBaseUrls(raw: string | undefined): readonly string[] | null {
  if (typeof raw !== "string") return null;
  const hosts = raw
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter((entry) => entry.startsWith("https://"));
  return hosts.length > 0 ? hosts : null;
}

/** Creates a client for the configured venues, defaulting to the shipped list. */
export function createMarketClient(baseUrlsVar?: string) {
  const configured = parseBaseUrls(baseUrlsVar);
  return createBinanceMarketClient(
    configured === null ? {} : { baseUrls: configured },
  );
}

/** The venue list a deployment will actually use, for diagnostics. */
export function effectiveBaseUrls(baseUrlsVar?: string): readonly string[] {
  return parseBaseUrls(baseUrlsVar) ?? BINANCE_REST_BASE_URLS;
}
