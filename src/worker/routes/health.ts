/**
 * `GET /api/health` — liveness probe plus the deployed strategy version.
 */

import { Hono } from "hono";

import type { HealthPayload } from "@/shared/types";
import type { Env } from "../env";

export const healthRoute = new Hono<{ Bindings: Env }>();

healthRoute.get("/", (c) => {
  const payload: HealthPayload = {
    ok: true,
    strategyVersion: c.env.STRATEGY_VERSION,
    time: new Date().toISOString(),
  };

  return c.json(payload);
});
