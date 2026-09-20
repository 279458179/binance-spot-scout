-- Spot Scout schema.
--
-- `scans` is the append-only signal log: one row per scan that produced a
-- decision (NO_TRADE scans are recorded too, so the no-trade ratio is
-- measurable). `scan_results` is filled in later by the backtest job, which
-- records what price actually did after each signal.
--
-- Read-only market data only: no accounts, no balances, no orders.

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  symbol TEXT,
  price REAL,
  score REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ENTRY_NOW', 'WAIT_PULLBACK', 'NO_TRADE')),
  market_regime TEXT NOT NULL CHECK (market_regime IN ('RISK_ON', 'NEUTRAL', 'RISK_OFF')),
  target_price REAL,
  invalidation_price REAL,
  features_json TEXT NOT NULL DEFAULT '{}',
  reasons_json TEXT NOT NULL DEFAULT '[]',
  risks_json TEXT NOT NULL DEFAULT '[]'
);

-- History is read newest-first and filtered by status, so index both paths.
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_symbol_created_at ON scans (symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_status_created_at ON scans (status, created_at DESC);

CREATE TABLE IF NOT EXISTS scan_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL UNIQUE REFERENCES scans (id) ON DELETE CASCADE,
  price_5m REAL,
  price_1h REAL,
  price_6h REAL,
  price_24h REAL,
  max_gain_24h REAL,
  max_drawdown_24h REAL,
  target5_hit INTEGER NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scan_results_scan_id ON scan_results (scan_id);
