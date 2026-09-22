/**
 * Transport-level tests for the market-data client.
 *
 * The behaviour under test is the one that keeps a deployment alive when
 * Binance refuses its egress: a geographic refusal must be recognised from the
 * response body, the host must be skipped for the rest of the process, and the
 * next configured venue must still be used.
 */

import { afterEach, describe, expect, it } from "vitest";

import { GEO_BLOCK_COOLDOWN_MS } from "@/config/api";
import { BinanceError, BinanceMarketClient, resetRateLimitState } from "@/lib/binance";
import { makeSeries } from "../fixtures/market";

const NOW = 1_700_000_000_000;
const BLOCKED = "https://blocked.example";
const WORKING = "https://working.example";

/**
 * The same series the fixtures build, re-encoded the way `/api/v3/klines`
 * actually sends it: a positional array, not an object.
 */
const KLINES = makeSeries("15m", [
  { count: 70, from: 100, to: 105, volume: 900 },
  { count: 10, from: 105, to: 104, volume: 900 },
]).map((bar) => [
  bar.openTime,
  String(bar.open),
  String(bar.high),
  String(bar.low),
  String(bar.close),
  String(bar.volume),
  bar.closeTime,
  String(bar.quoteVolume),
  bar.trades,
  String(bar.takerBuyBase),
  String(bar.takerBuyQuote),
  "0",
]);

interface Call {
  url: string;
  status: number;
  body: string;
}

/** Records every request and answers from a URL -> response script. */
function scriptedFetch(script: (url: string) => { status: number; body: string }): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    const { status, body } = script(url);
    calls.push({ url, status, body });
    return new Response(body, {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function makeClient(
  fetchImpl: typeof fetch,
  hosts: readonly string[],
  now = () => NOW,
): BinanceMarketClient {
  return new BinanceMarketClient({
    baseUrls: hosts,
    fetchImpl,
    now,
    sleepImpl: async () => {},
    maxAttempts: 1,
    requestTimeoutMs: 1_000,
  });
}

afterEach(() => {
  resetRateLimitState();
});

describe("geographic block handling", () => {
  it("recognises a 451 restricted-location body and moves to the next venue", async () => {
    const { fetchImpl, calls } = scriptedFetch((url) => {
      if (url.startsWith(BLOCKED)) {
        return {
          status: 451,
          body: JSON.stringify({
            code: 0,
            msg: "Service unavailable from a restricted location according to 'b. Eligibility'",
          }),
        };
      }
      return { status: 200, body: JSON.stringify(KLINES) };
    });

    const klines = await makeClient(fetchImpl, [BLOCKED, WORKING]).klines("BTCUSDT", "15m", 80);

    expect(klines).toHaveLength(KLINES.length);
    expect(calls.map((call) => call.url.startsWith(BLOCKED))).toEqual([true, false]);
  });

  it("recognises a 403 edge page as a block rather than a request error", async () => {
    const { fetchImpl } = scriptedFetch((url) => {
      if (url.startsWith(BLOCKED)) {
        return { status: 403, body: "<html><head><title>403 Forbidden</title></head></html>" };
      }
      return { status: 200, body: JSON.stringify(KLINES) };
    });

    await expect(makeClient(fetchImpl, [BLOCKED, WORKING]).klines("BTCUSDT", "15m", 80)).resolves.toHaveLength(
      KLINES.length,
    );
  });

  it("skips a blocked venue on later calls instead of probing it again", async () => {
    const { fetchImpl, calls } = scriptedFetch((url) => {
      if (url.startsWith(BLOCKED)) {
        return { status: 451, body: JSON.stringify({ msg: "restricted location" }) };
      }
      return { status: 200, body: JSON.stringify(KLINES) };
    });

    const client = makeClient(fetchImpl, [BLOCKED, WORKING]);
    await client.klines("BTCUSDT", "15m", 80);
    const callsAfterFirst = calls.length;

    await client.klines("ETHUSDT", "15m", 80);
    await client.klines("SOLUSDT", "15m", 80);

    // The first request probed both hosts; later requests only touch the venue
    // that works, so the block never costs latency again.
    expect(calls.length - callsAfterFirst).toBe(2);
    expect(calls.slice(callsAfterFirst).every((call) => call.url.startsWith(WORKING))).toBe(true);
  });

  it("re-probes a blocked venue once the cooldown has expired", async () => {
    let clock = NOW;
    const { fetchImpl, calls } = scriptedFetch((url) => {
      if (url.startsWith(BLOCKED)) {
        return { status: 451, body: JSON.stringify({ msg: "restricted location" }) };
      }
      return { status: 200, body: JSON.stringify(KLINES) };
    });

    const client = makeClient(fetchImpl, [BLOCKED, WORKING], () => clock);
    await client.klines("BTCUSDT", "15m", 80);
    const callsAfterFirst = calls.length;

    clock = NOW + GEO_BLOCK_COOLDOWN_MS + 1;
    await client.klines("ETHUSDT", "15m", 80);

    expect(calls.length - callsAfterFirst).toBe(2);
    expect(calls[callsAfterFirst]?.url.startsWith(BLOCKED)).toBe(true);
  });

  it("still reports DATA_UNAVAILABLE when every venue is blocked", async () => {
    const { fetchImpl } = scriptedFetch(() => ({
      status: 451,
      body: JSON.stringify({ msg: "Service unavailable from a restricted location" }),
    }));

    const error = await makeClient(fetchImpl, [BLOCKED, WORKING])
      .klines("BTCUSDT", "15m", 80)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BinanceError);
    expect((error as BinanceError).code).toBe("DATA_UNAVAILABLE");
  });

  it("does not treat an ordinary 400 as a block", async () => {
    const { fetchImpl } = scriptedFetch(() => ({
      status: 400,
      body: JSON.stringify({ code: -1121, msg: "Invalid symbol." }),
    }));

    const error = await makeClient(fetchImpl, [WORKING])
      .klines("NOPEUSDT", "15m", 80)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BinanceError);
    expect((error as BinanceError).message).not.toContain("blocked for our region");
  });
});
