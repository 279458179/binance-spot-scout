import { Hono } from "hono";

export interface Env {
  SCAN_CACHE: KVNamespace;
  DB: D1Database;
  ENABLE_DEBUG: string;
  STRATEGY_VERSION: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
