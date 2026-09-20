import { Hono } from "hono";
import { queryHistory } from "@/lib/db";
import type { HistoryEntry } from "@/shared/types";
import type { Env } from "../env";
import { buildApiError } from "./api-error";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const historyRoute = new Hono<{ Bindings: Env }>();

/** Returns recent scan history rows from D1, newest first. */
historyRoute.get("/", async (c) => {
  const raw = c.req.query("limit");
  let limit = DEFAULT_LIMIT;

  if (raw !== undefined && raw !== "") {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return c.json(
        buildApiError("INVALID_REQUEST", `limit 必须是 1 到 ${MAX_LIMIT} 之间的整数`),
        400,
      );
    }
    limit = parsed;
  }

  const entries: HistoryEntry[] = await queryHistory(c.env.DB, limit);
  return c.json({ ok: true, entries });
});
