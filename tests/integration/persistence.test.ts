/**
 * Integration tests for the persistence layer the Worker routes depend on.
 *
 * Both stores are faked down to their platform surface (KV HTTP-ish API, D1
 * prepared statements) so the tests exercise the real serialisation, validation
 * and SQL-binding code rather than a hand-written stub of it.
 */

/// <reference types="@cloudflare/workers-types" />

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CACHE_KEYS,
  CACHE_TTL_SECONDS,
  readLatestScan,
  writeLatestScan,
} from "@/lib/cache";
import { insertScan, queryHistory } from "@/lib/db";
import type { ScanPayload } from "@/shared/types";

/** Minimal in-memory KV recording TTLs so policy is assertable. */
function makeKv(): { kv: KVNamespace; entries: Map<string, string>; ttls: Map<string, number> } {
  const entries = new Map<string, string>();
  const ttls = new Map<string, number>();
  const kv = {
    async get(key: string) {
      return entries.get(key) ?? null;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      entries.set(key, value);
      if (options?.expirationTtl !== undefined) ttls.set(key, options.expirationTtl);
    },
  } as unknown as KVNamespace;
  return { kv, entries, ttls };
}

function makePayload(overrides: Partial<ScanPayload["result"]> = {}): ScanPayload {
  return {
    result: {
      status: "ENTRY_NOW",
      symbol: "SUIUSDT",
      baseAsset: "SUI",
      price: 3.37,
      score: 81,
      targetPct: 5,
      marketRegime: "RISK_ON",
      reasons: ["15m 回踩 EMA21 后重新站稳"],
      risks: ["距离短线压力位约 3.8%"],
      metrics: {
        rsi15m: 61,
        rsi1h: 58,
        volumeRatio: 1.8,
        spreadPct: 0.12,
        atrPct: 0.9,
      },
      plan: { referencePrice: 3.37, target5Pct: 3.5385, invalidation: 3.11 },
      generatedAt: "2026-09-22T00:00:00.000Z",
      strategyVersion: "1.0.0",
      ...overrides,
    },
    diagnostics: {
      universeCount: 412,
      liquidityFilterCount: 103,
      technicalScanCount: 103,
      deepScanCount: 15,
      candidateCount: 15,
      topCandidate: "SUIUSDT",
      topScore: 81,
      scanDurationMs: 5_400,
      dataTimestamp: 1_789_000_000_000,
      providerErrors: [],
      topCandidates: [],
    },
    cached: false,
  };
}

describe("scan snapshot cache", () => {
  it("round-trips a payload under the documented key and TTL", async () => {
    const { kv, entries, ttls } = makeKv();
    const payload = makePayload();

    await expect(writeLatestScan(kv, payload)).resolves.toBe(true);
    expect(entries.has(CACHE_KEYS.latestScan)).toBe(true);
    expect(ttls.get(CACHE_KEYS.latestScan)).toBe(CACHE_TTL_SECONDS.latestScan);

    await expect(readLatestScan(kv)).resolves.toEqual(payload);
  });

  it("reports a miss rather than throwing when nothing is cached", async () => {
    const { kv } = makeKv();

    await expect(readLatestScan(kv)).resolves.toBeNull();
  });

  it("treats a corrupt entry as a miss so the API can rescan", async () => {
    const { kv, entries } = makeKv();
    entries.set(CACHE_KEYS.latestScan, "{not json");

    await expect(readLatestScan(kv)).resolves.toBeNull();
  });

  it("treats a well-formed but wrong-shaped entry as a miss", async () => {
    const { kv, entries } = makeKv();
    entries.set(CACHE_KEYS.latestScan, JSON.stringify({ result: { status: "ENTRY_NOW" } }));

    await expect(readLatestScan(kv)).resolves.toBeNull();
  });

  it("survives a KV transport failure without throwing", async () => {
    const kv = {
      async put() {
        throw new Error("KV unavailable");
      },
      async get() {
        throw new Error("KV unavailable");
      },
    } as unknown as KVNamespace;

    await expect(writeLatestScan(kv, makePayload())).resolves.toBe(false);
    await expect(readLatestScan(kv)).resolves.toBeNull();
  });
});

/** Records every executed statement so the SQL and bindings are assertable. */
function makeDb(rows: Record<string, unknown>[] = []): {
  db: D1Database;
  calls: Array<{ sql: string; params: unknown[] }>;
} {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      const record = { sql, params: [] as unknown[] };
      const statement = {
        bind(...params: unknown[]) {
          record.params = params;
          return statement;
        },
        async run() {
          calls.push(record);
          // D1 reports the inserted id on `meta.last_row_id`; the writer treats
          // a missing or non-positive id as a failed write.
          return { success: true, meta: { last_row_id: 1 } };
        },
        async all() {
          calls.push(record);
          return { results: rows, success: true, meta: {} };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { db, calls };
}

describe("scan history writes", () => {
  it("binds the plan and parsed JSON columns for a tradable candidate", async () => {
    const { db, calls } = makeDb();

    await expect(insertScan(db, makePayload())).resolves.toBe(1);

    const insert = calls.find((call) => call.sql.includes("INSERT INTO scans"));
    expect(insert).toBeDefined();
    const params = insert!.params;
    expect(params[0]).toBe("2026-09-22T00:00:00.000Z");
    expect(params[1]).toBe("SUIUSDT");
    expect(params[3]).toBe(81);
    expect(params[4]).toBe("ENTRY_NOW");
    expect(params[5]).toBe("RISK_ON");
    expect(params[6]).toBeCloseTo(3.5385, 4);
    expect(params[7]).toBeCloseTo(3.11, 4);
    expect(JSON.parse(String(params[8]))).toMatchObject({ baseAsset: "SUI", targetPct: 5 });
    expect(JSON.parse(String(params[9]))).toHaveLength(1);
  });

  it("stores a no-trade scan with null plan columns so the ratio stays measurable", async () => {
    const { db, calls } = makeDb();
    const payload = makePayload({
      status: "NO_TRADE",
      symbol: null,
      baseAsset: null,
      price: null,
      score: 0,
      metrics: null,
      plan: null,
    });

    await insertScan(db, payload);

    const insert = calls.find((call) => call.sql.includes("INSERT INTO scans"));
    expect(insert!.params[1]).toBeNull();
    expect(insert!.params[3]).toBe(0);
    expect(insert!.params[4]).toBe("NO_TRADE");
    expect(insert!.params[6]).toBeNull();
    expect(insert!.params[7]).toBeNull();
  });

  it("reports a D1 failure as null instead of breaking the response", async () => {
    const db = {
      prepare() {
        throw new Error("D1 write failed");
      },
    } as unknown as D1Database;

    await expect(insertScan(db, makePayload())).resolves.toBeNull();
  });
});

describe("scan history reads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps rows newest-first into history entries", async () => {
    const { db, calls } = makeDb([
      {
        id: 7,
        created_at: "2026-09-22T00:00:00.000Z",
        symbol: "SUIUSDT",
        price: 3.37,
        score: 81,
        status: "ENTRY_NOW",
        market_regime: "RISK_ON",
        target_price: 3.5385,
        invalidation_price: 3.11,
        reasons_json: '["15m 回踩 EMA21 后重新站稳"]',
        risks_json: '["距离短线压力位约 3.8%"]',
      },
    ]);

    const entries = await queryHistory(db, 50);

    expect(entries).toEqual([
      {
        id: 7,
        createdAt: "2026-09-22T00:00:00.000Z",
        symbol: "SUIUSDT",
        price: 3.37,
        score: 81,
        status: "ENTRY_NOW",
        marketRegime: "RISK_ON",
        targetPrice: 3.5385,
        invalidationPrice: 3.11,
        reasons: ["15m 回踩 EMA21 后重新站稳"],
        risks: ["距离短线压力位约 3.8%"],
      },
    ]);
    expect(calls[0]!.sql).toContain("ORDER BY created_at DESC");
    expect(calls[0]!.params).toEqual([50]);
  });

  it("returns an empty list when D1 fails", async () => {
    const db = {
      prepare() {
        throw new Error("D1 read failed");
      },
    } as unknown as D1Database;

    await expect(queryHistory(db, 50)).resolves.toEqual([]);
  });
});
