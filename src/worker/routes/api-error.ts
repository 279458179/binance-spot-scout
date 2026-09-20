import type { ApiError } from "@/shared/types";

/** Error codes shared by every worker API route. */
export type ApiErrorCode = "DATA_UNAVAILABLE" | "INVALID_REQUEST" | "INTERNAL";

/** Builds the unified error envelope returned by the worker API. */
export function buildApiError(code: ApiErrorCode, message: string): ApiError {
  return { ok: false, error: code, message, code };
}
