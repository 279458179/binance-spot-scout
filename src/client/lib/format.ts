/**
 * Number / time formatting helpers.
 *
 * Every helper is total: missing or non-finite input renders as an em dash so
 * a partial API payload can never produce `NaN` on screen.
 */

const DASH = "—";

/** Price with a sensible number of decimals for its magnitude. */
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return DASH;
  }
  const magnitude = Math.abs(value);
  let decimals: number;
  if (magnitude >= 1000) {
    decimals = 2;
  } else if (magnitude >= 100) {
    decimals = 3;
  } else if (magnitude >= 1) {
    decimals = 4;
  } else if (magnitude >= 0.01) {
    decimals = 5;
  } else {
    decimals = 8;
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Math.min(2, decimals),
    maximumFractionDigits: decimals,
  });
}

/** Percent with an explicit sign, e.g. `+5.00%`. */
export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return DASH;
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

/** Score rendered as `82.4` — kept separate so the caller adds `/ 100`. */
export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return DASH;
  }
  return value.toFixed(1);
}

/** Whole-number score for compact rows. */
export function formatScoreShort(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return DASH;
  }
  return Math.round(value).toString();
}

/** 24h quote volume in the Chinese 万 / 亿 convention. */
export function formatQuoteVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return DASH;
  }
  if (value >= 1e8) {
    return `${(value / 1e8).toFixed(2)} 亿`;
  }
  if (value >= 1e4) {
    return `${(value / 1e4).toFixed(1)} 万`;
  }
  return value.toFixed(0);
}

/** `BTCUSDT` → `BTC / USDT`. */
export function formatSymbolPair(symbol: string | null | undefined): string {
  if (!symbol) {
    return DASH;
  }
  if (symbol.endsWith("USDT") && symbol.length > 4) {
    return `${symbol.slice(0, -4)} / USDT`;
  }
  return symbol;
}

/** Milliseconds since `iso`, clamped at zero. */
export function ageMs(iso: string | null | undefined, now: number): number {
  if (!iso) {
    return Number.POSITIVE_INFINITY;
  }
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, now - timestamp);
}

/** Human relative time: `刚刚` / `12 秒前` / `3 分钟前` / `2 小时前`. */
export function formatAge(ms: number): string {
  if (!Number.isFinite(ms)) {
    return "时间未知";
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 5) {
    return "刚刚";
  }
  if (seconds < 60) {
    return `${String(seconds)} 秒前`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${String(minutes)} 分钟前`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${String(hours)} 小时前`;
  }
  return `${String(Math.floor(hours / 24))} 天前`;
}

/** Clock time in the visitor's locale, e.g. `14:32:05`. */
export function formatClock(iso: string | null | undefined): string {
  if (!iso) {
    return DASH;
  }
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) {
    return DASH;
  }
  return new Date(timestamp).toLocaleTimeString("zh-CN", { hour12: false });
}

/** Clock time from an epoch-millisecond tick, e.g. `14:32:05`. */
export function formatClockMs(ms: number): string {
  if (!Number.isFinite(ms)) {
    return DASH;
  }
  return new Date(ms).toLocaleTimeString("zh-CN", { hour12: false });
}

/** Local date + time used by the history table. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return DASH;
  }
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) {
    return DASH;
  }
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}
