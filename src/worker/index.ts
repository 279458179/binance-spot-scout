/**
 * Worker entrypoint: mounts the public scan API plus the cron handler.
 *
 * Route modules are registered under `/api/*`; the scalar request deals with a
 * single symbol at most so one request never fans out across the whole market.
 */

import { Hono } from "hono";

import { isBinanceError } from "@/lib/binance";
import type { ApiError } from "@/shared/types";
import type { Env } from "./env";
import { buildApiError } from "./routes/api-error";
import { healthRoute } from "./routes/health";
import { historyRoute } from "./routes/history";
import { latestRoute } from "./routes/latest";
import { mcpRoute } from "./routes/mcp";
import { researchRoute } from "./routes/research";
import { scanRoute } from "./routes/scan";
import { symbolRoute } from "./routes/symbol";
import { scheduled } from "./scheduled";

const app = new Hono<{ Bindings: Env }>();

/**
 * Hides diagnostic payloads unless `ENABLE_DEBUG` is `"true"`.
 * Only JSON responses are rewritten; anything else passes through untouched.
 */
app.use("*", async (c, next) => {
  await next();

  if (c.env.ENABLE_DEBUG === "true") {
    return;
  }

  if (!c.res.headers.get("content-type")?.includes("application/json")) {
    return;
  }

  let body: unknown;
  try {
    body = await c.res.clone().json();
  } catch {
    return;
  }

  if (body === null || typeof body !== "object" || !("diagnostics" in body)) {
    return;
  }

  const { diagnostics: _diagnostics, ...rest } = body as Record<string, unknown>;

  c.res = new Response(JSON.stringify(rest), {
    status: c.res.status,
    headers: { "content-type": "application/json; charset=UTF-8" },
  });
});

app.route("/api/health", healthRoute);
app.route("/api/latest", latestRoute);
app.route("/api/scan", scanRoute);
app.route("/api/history", historyRoute);
app.route("/api/research", researchRoute);
app.route("/api/symbol", symbolRoute);
app.route("/api/mcp", mcpRoute);

app.notFound((c) => c.json(buildApiError("INVALID_REQUEST", "接口不存在"), 404));

app.onError((error, c) => {
  if (isBinanceError(error)) {
    console.error("行情源不可用", error.code, error.message);
    return c.json(buildApiError("DATA_UNAVAILABLE", "行情源暂时不可用，请稍后重试"), 502);
  }

  console.error("未处理异常", error);

  const payload: ApiError = buildApiError("INTERNAL", "服务内部异常");

  return c.json(payload, 500);
});

export default {
  fetch: app.fetch,
  scheduled,
};
