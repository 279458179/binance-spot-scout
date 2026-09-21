import { describe, expect, it } from "vitest";

import { EXCLUDED_BASE_ASSETS, EXCLUDED_SYMBOL_PATTERNS, QUOTE_ASSET } from "@/config/strategy";
import type { SymbolInfo } from "@/shared/types";
import { buildUniverse, classifySymbols, universeSymbols } from "@/strategy/universe";
import { makeSymbolInfo } from "../fixtures/market";

/** A plain USDT spot pair that should always survive the universe filter. */
function makeTradable(
  symbol: string,
  baseAsset = symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol,
): SymbolInfo {
  return makeSymbolInfo({ symbol, baseAsset, quoteAsset: "USDT", status: "TRADING" });
}

describe("classifySymbols", () => {
  it("includes a plain USDT spot pair", () => {
    const [decision] = classifySymbols([makeTradable("ETHUSDT")]);

    expect(decision.included).toBe(true);
    expect(decision.reason).toBeNull();
  });

  it("rejects symbols that are not actively trading", () => {
    for (const status of ["BREAK", "HALT", "END_OF_DAY", "PRE_TRADING"] as const) {
      const [decision] = classifySymbols([
        makeSymbolInfo({ symbol: "ETHUSDT", baseAsset: "ETH", status }),
      ]);

      expect(decision.included, status).toBe(false);
      expect(decision.reason, status).toBe("NOT_TRADING");
    }
  });

  it("rejects non-USDT quote assets", () => {
    const [decision] = classifySymbols([
      makeSymbolInfo({ symbol: "ETHBTC", baseAsset: "ETH", quoteAsset: "BTC" }),
    ]);

    expect(decision.included).toBe(false);
    expect(decision.reason).toBe("QUOTE_ASSET");
  });

  it("uses the configured USDT quote asset", () => {
    expect(QUOTE_ASSET).toBe("USDT");
  });

  it("rejects every base asset on the exclusion list", () => {
    for (const baseAsset of EXCLUDED_BASE_ASSETS) {
      const [decision] = classifySymbols([makeTradable(`${baseAsset}USDT`, baseAsset)]);

      expect(decision.included, baseAsset).toBe(false);
      expect(decision.reason, baseAsset).toBe("EXCLUDED_BASE_ASSET");
    }
  });

  it("keeps a stablecoin not on the exclusion list", () => {
    expect(EXCLUDED_BASE_ASSETS.has("FRAX")).toBe(false);

    const [decision] = classifySymbols([makeTradable("FRAXUSDT", "FRAX")]);

    expect(decision.included).toBe(true);
    expect(decision.reason).toBeNull();
  });

  it("rejects leveraged-token patterns", () => {
    const cases: Array<[string, string]> = [
      ["BTCUPUSDT", "BTCUP"],
      ["BTCDOWNUSDT", "BTCDOWN"],
      ["ETHBULLUSDT", "ETHBULL"],
      ["ETHBEARUSDT", "ETHBEAR"],
    ];

    for (const [symbol, baseAsset] of cases) {
      const [decision] = classifySymbols([makeTradable(symbol, baseAsset)]);

      expect(decision.included, symbol).toBe(false);
      expect(decision.reason, symbol).toBe("EXCLUDED_PATTERN");
    }
  });

  it("covers all configured patterns", () => {
    expect(EXCLUDED_SYMBOL_PATTERNS.length).toBeGreaterThan(0);
    expect(EXCLUDED_SYMBOL_PATTERNS.every((pattern) => pattern.test("BTCUPUSDT"))).toBe(false);
  });

  it("does not reject a separate spot asset whose name merely contains UP", () => {
    const [decision] = classifySymbols([makeTradable("SUPERUSDT", "SUPER")]);

    expect(decision.included).toBe(true);
    expect(decision.reason).toBeNull();
  });

  it("applies NOT_TRADING before every other rule", () => {
    const [decision] = classifySymbols([
      makeSymbolInfo({
        symbol: "USDCUPUSDT",
        baseAsset: "USDC",
        quoteAsset: "BTC",
        status: "BREAK",
      }),
    ]);

    expect(decision.reason).toBe("NOT_TRADING");
  });

  it("applies QUOTE_ASSET before base-asset and pattern rules", () => {
    const [decision] = classifySymbols([
      makeSymbolInfo({
        symbol: "USDCUPUSDT",
        baseAsset: "USDC",
        quoteAsset: "BTC",
        status: "TRADING",
      }),
    ]);

    expect(decision.reason).toBe("QUOTE_ASSET");
  });

  it("applies EXCLUDED_BASE_ASSET before the pattern rules", () => {
    const [decision] = classifySymbols([
      makeSymbolInfo({
        symbol: "USDCUPUSDT",
        baseAsset: "USDC",
        quoteAsset: "USDT",
        status: "TRADING",
      }),
    ]);

    expect(decision.reason).toBe("EXCLUDED_BASE_ASSET");
  });

  it("classifies every input in order", () => {
    const decisions = classifySymbols([makeTradable("ETHUSDT"), makeTradable("BTCUPUSDT", "BTCUP")]);

    expect(decisions).toHaveLength(2);
    expect(decisions[0].symbol.symbol).toBe("ETHUSDT");
    expect(decisions[1].symbol.symbol).toBe("BTCUPUSDT");
  });

  it("returns an empty list for empty input", () => {
    expect(classifySymbols([])).toEqual([]);
  });
});

describe("buildUniverse", () => {
  it("keeps only included symbols, preserving order", () => {
    const universe = buildUniverse([
      makeTradable("ETHUSDT"),
      makeTradable("USDCUSDT", "USDC"),
      makeTradable("SOLUSDT"),
      makeSymbolInfo({ symbol: "BTCUSDT", baseAsset: "BTC", status: "HALT" }),
    ]);

    expect(universe.map((symbol) => symbol.symbol)).toEqual(["ETHUSDT", "SOLUSDT"]);
  });

  it("does not mutate the caller's array", () => {
    const input = [makeTradable("ETHUSDT"), makeTradable("BTCUPUSDT", "BTCUP")];
    const snapshot = [...input];

    buildUniverse(input);

    expect(input).toEqual(snapshot);
  });

  it("returns an empty universe when nothing qualifies", () => {
    expect(buildUniverse([makeSymbolInfo({ symbol: "ETHBTC", quoteAsset: "BTC" })])).toEqual([]);
  });
});

describe("universeSymbols", () => {
  it("returns plain ticker strings", () => {
    const symbols = universeSymbols([makeTradable("ETHUSDT"), makeTradable("SOLUSDT")]);

    expect(symbols).toEqual(["ETHUSDT", "SOLUSDT"]);
  });

  it("returns an empty array for an empty universe", () => {
    expect(universeSymbols([])).toEqual([]);
  });
});
