/**
 * Thin fetch wrapper around the Spot Scout Worker API.
 *
 * The Worker exposes three response shapes:
 *
 *   1. a bare payload  — `/api/latest`, `/api/scan`, `/api/symbol/:symbol`
 *   2. an envelope     — `/api/history` → `{ ok: true, entries }`
 *   3. an error body   — `{ ok: false, error, message, code? }`
 *
 * Every call funnels through `request()` so the UI only ever has to deal with
 * typed data or a single `ApiRequestError`.
 *
 * NOTE: the Worker strips `diagnostics` from JSON responses unless debug mode
 * is enabled, so `ScanResponse.diagnostics` is optional on the client even
 * though the shared `ScanPayload` type declares it as required.
 */

import type {
  ApiError,
  HealthPayload,
  HistoryEntry,
  ScanDiagnostics,
  ScanPayload,
  SymbolDetail,
} from "@/shared/types";

/** `/api/scan` and `/api/latest` — diagnostics appear only in debug mode. */
export type ScanResponse = Omit<ScanPayload, "diagnostics"> & {
  diagnostics?: ScanDiagnostics;
};

/** Shown when the request never reached the Worker (offline / DNS / abort). */
export const OFFLINE_MESSAGE = "币喵暂时连不上市场 🐱";

/** Shown when the Worker itself could not reach the exchange. */
export const DATA_UNAVAILABLE_MESSAGE = "行情源暂时不可用，先别用旧数据做判断。";

/** Error thrown by every helper below. Carries the HTTP status and API code. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiError["code"] | undefined;
  readonly offline: boolean;

  constructor(
    message: string,
    options: { status?: number; code?: ApiError["code"]; offline?: boolean } = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options.status ?? 0;
    this.code = options.code;
    this.offline = options.offline ?? false;
  }
}

function isApiErrorBody(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { ok?: unknown; message?: unknown };
  return candidate.ok === false && typeof candidate.message === "string";
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function fallbackMessage(status: number): string {
  if (status === 502 || status === 503 || status === 504) {
    return DATA_UNAVAILABLE_MESSAGE;
  }
  if (status === 429) {
    return "请求太频繁了，缓一小会儿再试 🐾";
  }
  return `请求失败（HTTP ${status}）`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }
  if (init?.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiRequestError(OFFLINE_MESSAGE, { offline: true });
  }

  const body = await readBody(response);

  if (!response.ok) {
    if (isApiErrorBody(body)) {
      throw new ApiRequestError(body.message, {
        status: response.status,
        code: body.code,
      });
    }
    throw new ApiRequestError(fallbackMessage(response.status), {
      status: response.status,
    });
  }

  if (body === null) {
    throw new ApiRequestError("服务返回了空响应，请重试一次。", {
      status: response.status,
    });
  }

  return body as T;
}

/** Turns any thrown value into a message that is safe to render. */
export function describeError(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    return cause.message;
  }
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  return OFFLINE_MESSAGE;
}

/** `GET /api/latest` — cached scan, or a fresh one when the cache is cold. */
export function fetchLatestScan(): Promise<ScanResponse> {
  return request<ScanResponse>("/api/latest");
}

/** `POST /api/scan` — fresh scan, cooldown-protected on the server. */
export function requestScan(): Promise<ScanResponse> {
  return request<ScanResponse>("/api/scan", { method: "POST" });
}

/** `GET /api/history` — envelope is unpacked here so callers get the array. */
export async function fetchHistory(limit = 20): Promise<HistoryEntry[]> {
  const body = await request<{ ok: boolean; entries: HistoryEntry[] }>(
    `/api/history?limit=${String(limit)}`,
  );
  return Array.isArray(body.entries) ? body.entries : [];
}

/** `GET /api/symbol/:symbol` — deep metrics for one symbol. */
export function fetchSymbolDetail(symbol: string): Promise<SymbolDetail> {
  return request<SymbolDetail>(`/api/symbol/${encodeURIComponent(symbol.toUpperCase())}`);
}

/** `GET /api/health` — liveness probe used by the debug page. */
export function fetchHealth(): Promise<HealthPayload> {
  return request<HealthPayload>("/api/health");
}
