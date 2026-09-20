/**
 * Barrel for the KV cache layer.
 *
 * Import from `@/lib/cache` rather than reaching into `kv.ts` directly so the
 * key layout and TTL policy stay in one place as more caches are added.
 */

export {
  CACHE_KEYS,
  CACHE_TTL_SECONDS,
  readBtcRegime,
  readExchangeInfo,
  readLatestScan,
  writeBtcRegime,
  writeExchangeInfo,
  writeLatestScan,
} from "./kv";

export type { BtcRegimeSnapshot } from "./kv";
