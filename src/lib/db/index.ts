/**
 * Barrel for the D1 persistence layer.
 *
 * The `scans` table is append-only and read back newest-first; `scan_results`
 * is written by the backtest job, not here.
 */

export { insertScan } from "./scans";
export { queryHistory } from "./history";
