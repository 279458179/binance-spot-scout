/**
 * Worker bindings shared by every route module.
 *
 * Kept in its own file so route modules can import the type without pulling in
 * the app entrypoint (which would create an import cycle).
 */
export interface Env {
  /** KV namespace holding the latest scan payload and market snapshots. */
  SCAN_CACHE: KVNamespace;
  /** D1 database storing scan history. */
  DB: D1Database;
  /** `"true"` exposes diagnostic payloads that are hidden in production. */
  ENABLE_DEBUG: string;
  /** Strategy version reported by `/api/health`. */
  STRATEGY_VERSION: string;
}
