-- v1.1.0 outcome schema.
--
-- A statistical sample is one closed 15m decision candle per symbol/status.
-- `decision_candle_key` is the kline open time in milliseconds; the unique
-- index makes repeated cron scans inside that candle idempotent.

ALTER TABLE scans ADD COLUMN decision_candle_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scans_decision_candle
  ON scans (symbol, status, decision_candle_key)
  WHERE decision_candle_key IS NOT NULL AND symbol IS NOT NULL;

ALTER TABLE scan_results ADD COLUMN target3_hit INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_scans_created_at_status_symbol
  ON scans (status, symbol, created_at DESC);
