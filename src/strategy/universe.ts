/**
 * Stage 1 of the scan funnel: turn the raw exchangeInfo payload into the set of
 * USDT spot pairs this strategy is willing to look at.
 *
 * Pure and synchronous on purpose so it can be unit-tested against a fixture
 * without touching the network.
 */

import {
  EXCLUDED_BASE_ASSETS,
  EXCLUDED_SYMBOL_PATTERNS,
  QUOTE_ASSET,
} from "@/config/strategy";
import type { SymbolInfo } from "@/shared/types";

/** Why a symbol was dropped, for diagnostics and tests. */
export type UniverseRejection = "QUOTE_ASSET" | "EXCLUDED_BASE_ASSET" | "EXCLUDED_PATTERN" | "NOT_TRADING";

export interface UniverseDecision {
  symbol: SymbolInfo;
  included: boolean;
  reason: UniverseRejection | null;
}

/** Classifies every symbol; useful for `/debug` funnel breakdowns. */
export function classifySymbols(symbols: readonly SymbolInfo[]): UniverseDecision[] {
  return symbols.map((symbol) => {
    if (symbol.status !== "TRADING") {
      return { symbol, included: false, reason: "NOT_TRADING" as const };
    }
    if (symbol.quoteAsset !== QUOTE_ASSET) {
      return { symbol, included: false, reason: "QUOTE_ASSET" as const };
    }
    if (EXCLUDED_BASE_ASSETS.has(symbol.baseAsset)) {
      return { symbol, included: false, reason: "EXCLUDED_BASE_ASSET" as const };
    }
    if (EXCLUDED_SYMBOL_PATTERNS.some((pattern) => pattern.test(symbol.symbol))) {
      return { symbol, included: false, reason: "EXCLUDED_PATTERN" as const };
    }
    return { symbol, included: true, reason: null };
  });
}

/**
 * The tradable USDT universe: stablecoins, fiat proxies and leveraged tokens are
 * removed because their "trend" is an artefact of the peg or the token wrapper.
 */
export function buildUniverse(symbols: readonly SymbolInfo[]): SymbolInfo[] {
  return classifySymbols(symbols)
    .filter((decision) => decision.included)
    .map((decision) => decision.symbol);
}

/** Symbols that survived the universe filter, as plain ticker strings. */
export function universeSymbols(symbols: readonly SymbolInfo[]): string[] {
  return buildUniverse(symbols).map((symbol) => symbol.symbol);
}
