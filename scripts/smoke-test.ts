/**
 * Live smoke test against the public Binance market-data endpoints.
 *
 * Purpose: prove the transport layer is wired to the real API rather than to
 * mocks. It exercises all four call shapes the scanner depends on and prints
 * the raw numbers so a human can eyeball them.
 *
 * Run with `npm run smoke-test`. Requires outbound network access; the
 * `data-api.binance.vision` host is reachable directly from Node.
 */

import {
  createBinanceMarketClient,
  describeBinanceError,
  midPrice,
  spreadPct,
} from "../src/lib/binance/index";

const HEAD_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"] as const;
const EXPECTED_PAIR_COUNT = 493;

function stamp(label: string, value: string | number): void {
  console.log(`${label.padEnd(28)} ${value}`);
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const client = createBinanceMarketClient();

  try {
    console.log("=== 1. exchangeInfo ===");
    const symbols = await client.exchangeInfo();
    const tradable = symbols.filter((entry) => entry.quoteAsset === "USDT");
    stamp("total symbols returned", symbols.length);
    stamp("TRADING + USDT pairs", tradable.length);
    stamp("first 5 pairs", tradable.slice(0, 5).map((e) => e.symbol).join(", "));
    if (tradable.length < 100) {
      throw new Error(`universe too small: ${tradable.length} USDT pairs`);
    }

    console.log("\n=== 2. ticker24h (single) ===");
    const [btc] = await client.ticker24h(["BTCUSDT"]);
    if (btc === undefined) throw new Error("no BTCUSDT ticker returned");
    stamp("symbol", btc.symbol);
    stamp("lastPrice", btc.lastPrice);
    stamp("priceChangePercent", btc.priceChangePercent);
    stamp("quoteVolume (24h USDT)", Math.round(btc.quoteVolume).toLocaleString("en-US"));
    stamp("trades (24h)", btc.count);
    if (!(btc.lastPrice > 0) || !(btc.quoteVolume > 0)) {
      throw new Error("ticker24h returned non-positive price or volume");
    }

    console.log("\n=== 3. klines (BTCUSDT, 1h, 200) ===");
    const klines = await client.klines("BTCUSDT", "1h", 200);
    const first = klines[0];
    const last = klines[klines.length - 1];
    if (first === undefined || last === undefined) throw new Error("klines returned no candles");
    stamp("candles returned", klines.length);
    stamp("first openTime", new Date(first.openTime).toISOString());
    stamp("last closeTime", new Date(last.closeTime).toISOString());
    stamp("last close", last.close);
    stamp("last candle volume", last.volume);
    const ordered = klines.every((k, i) => i === 0 || k.openTime > (klines[i - 1]?.openTime ?? 0));
    stamp("openTime strictly ascending", ordered ? "yes" : "NO");
    if (klines.length < 100 || !ordered) throw new Error("klines payload failed integrity check");

    console.log("\n=== 4. bookTicker (batch) ===");
    const books = await client.bookTicker([...HEAD_SYMBOLS]);
    stamp("books returned", books.length);
    console.log("");
    console.log("symbol      bid            ask            mid            spread%");
    for (const book of books) {
      const mid = midPrice(book);
      const spread = spreadPct(book);
      console.log(
        `${book.symbol.padEnd(11)} ${String(book.bidPrice).padEnd(14)} ${String(
          book.askPrice,
        ).padEnd(14)} ${mid.toFixed(2).padEnd(14)} ${spread.toFixed(4)}`,
      );
      if (!(mid > 0)) throw new Error(`${book.symbol}: bookTicker mid price not positive`);
      if (spread > 1) throw new Error(`${book.symbol}: spread ${spread.toFixed(4)}% exceeds 1%`);
    }
    if (books.length !== HEAD_SYMBOLS.length) {
      throw new Error(`expected ${HEAD_SYMBOLS.length} books, got ${books.length}`);
    }

    const delta = tradable.length - EXPECTED_PAIR_COUNT;
    console.log("");
    stamp("USDT pairs vs expected 493", delta === 0 ? "exact match" : `${delta > 0 ? "+" : ""}${delta}`);
    console.log(`\nSMOKE TEST PASSED in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  } catch (error) {
    console.error("\nSMOKE TEST FAILED");
    console.error(`  ${describeBinanceError(error, "smoke-test")}`);
    process.exitCode = 1;
  }
}

await main();
