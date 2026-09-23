/**
 * Stateless MCP server for Binance public market data.
 *
 * The endpoint speaks JSON-RPC 2.0 over HTTP and exposes only market-data
 * tools. Every call is independent, so it works without sessions or keys.
 */

import { Hono } from "hono";

import { STRATEGY_VERSION } from "@/config/strategy";
import type { Env } from "../env";
import { createMarketClient } from "../services/market-client";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const PROTOCOL_VERSION = "2025-06-18";
const INTERVALS = new Set([
  "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h",
  "6h", "8h", "12h", "1d", "3d", "1w", "1M",
]);
const SYMBOL_PATTERN = /^[A-Z0-9]{3,20}$/;

const TOOLS: ToolDefinition[] = [
  {
    name: "get_ticker",
    description: "获取一个现货交易对的 24 小时行情。",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string", pattern: "^[A-Z0-9]{3,20}$" } },
      required: ["symbol"],
    },
  },
  {
    name: "get_book_tickers",
    description: "批量获取现货交易对的最优买卖价。",
    inputSchema: {
      type: "object",
      properties: {
        symbols: {
          type: "array",
          items: { type: "string", pattern: "^[A-Z0-9]{3,20}$" },
          maxItems: 100,
          minItems: 1,
        },
      },
      required: ["symbols"],
    },
  },
  {
    name: "get_klines",
    description: "获取现货 K 线。",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", pattern: "^[A-Z0-9]{3,20}$" },
        interval: { type: "string", enum: [...INTERVALS] },
        limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
      },
      required: ["symbol", "interval"],
    },
  },
  {
    name: "get_depth",
    description: "获取现货订单簿深度。",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", pattern: "^[A-Z0-9]{3,20}$" },
        limit: {
          type: "integer",
          enum: [5, 10, 20, 50, 100, 500, 1000, 5000],
          default: 100,
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_trades",
    description: "获取最近公开成交。",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", pattern: "^[A-Z0-9]{3,20}$" },
        limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_avg_price",
    description: "获取近期成交均价。",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", pattern: "^[A-Z0-9]{3,20}$" },
        mins: { type: "integer", minimum: 1, maximum: 60, default: 5 },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_exchange_info",
    description: "获取现货交易规则与可用交易对。",
    inputSchema: { type: "object", properties: {} },
  },
];

function jsonError(code: number, message: string, id: JsonRpcId = null): unknown {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function validateToolArguments(name: string, args: Record<string, unknown>): void {
  const requireSymbol = (): string => {
    const value = args.symbol;
    if (typeof value !== "string" || !SYMBOL_PATTERN.test(value)) {
      throw new Error("无效的 symbol");
    }
    return value;
  };

  switch (name) {
    case "get_ticker":
    case "get_depth":
    case "get_trades":
    case "get_avg_price":
      requireSymbol();
      return;
    case "get_book_tickers": {
      const symbols = args.symbols;
      if (
        !Array.isArray(symbols) ||
        symbols.length < 1 ||
        symbols.length > 100 ||
        symbols.some((item) => typeof item !== "string" || !SYMBOL_PATTERN.test(item))
      ) {
        throw new Error("无效的 symbols");
      }
      return;
    }
    case "get_klines": {
      requireSymbol();
      if (typeof args.interval !== "string" || !INTERVALS.has(args.interval)) {
        throw new Error("无效的 interval");
      }
      return;
    }
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

async function callTool(
  name: string,
  rawArgs: unknown,
  baseUrlsVar: string | undefined,
): Promise<unknown> {
  const args = rawArgs !== null && typeof rawArgs === "object"
    ? rawArgs as Record<string, unknown>
    : {};
  validateToolArguments(name, args);
  const client = createMarketClient(baseUrlsVar);

  switch (name) {
    case "get_ticker": {
      const result = await client.ticker24h([args.symbol as string]);
      return result[0] ?? null;
    }
    case "get_book_tickers":
      return client.bookTicker(args.symbols as string[]);
    case "get_klines": {
      const limit = typeof args.limit === "number" ? args.limit : 100;
      return client.klines(
        args.symbol as string,
        args.interval as Parameters<typeof client.klines>[1],
        limit,
      );
    }
    case "get_depth": {
      const limit = typeof args.limit === "number" ? args.limit : 100;
      return client.depth(args.symbol as string, limit);
    }
    case "get_trades": {
      const limit = typeof args.limit === "number" ? args.limit : 100;
      return client.trades(args.symbol as string, limit);
    }
    case "get_avg_price": {
      const mins = typeof args.mins === "number" ? args.mins : 5;
      return client.avgPrice(args.symbol as string, mins);
    }
    case "get_exchange_info":
      return client.exchangeInfo();
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

export const mcpRoute = new Hono<{ Bindings: Env }>();

mcpRoute.options("/", () => new Response(null, {
  status: 204,
  headers: {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version",
  },
}));

mcpRoute.post("/", async (c) => {
  let request: JsonRpcRequest;
  try {
    request = await c.req.json<JsonRpcRequest>();
  } catch {
    return c.json(jsonError(-32700, "请求不是合法 JSON"), 400);
  }

  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return c.json(jsonError(-32600, "无效的 JSON-RPC 请求", request.id as JsonRpcId), 400);
  }

  if (request.id === undefined || request.id === null) {
    return new Response(null, { status: 202 });
  }

  const id = request.id as JsonRpcId;

  try {
    if (request.method === "initialize") {
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: {
            name: "binance-spot-market-data",
            version: STRATEGY_VERSION,
          },
        },
      });
    }

    if (request.method === "ping") {
      return c.json({ jsonrpc: "2.0", id, result: {} });
    }

    if (request.method === "tools/list") {
      return c.json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    }

    if (request.method === "tools/call") {
      const params = request.params !== null && typeof request.params === "object"
        ? request.params as { name?: unknown; arguments?: unknown }
        : {};
      if (typeof params.name !== "string") {
        return c.json(jsonError(-32602, "缺少工具名称", id), 400);
      }
      try {
        const result = await callTool(params.name, params.arguments, c.env.BINANCE_BASE_URLS);
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            isError: false,
          },
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        return c.json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: message }], isError: true },
        });
      }
    }

    return c.json(jsonError(-32601, `未知方法: ${request.method}`, id), 404);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return c.json(jsonError(-32603, `服务异常: ${message}`, id), 500);
  }
});
