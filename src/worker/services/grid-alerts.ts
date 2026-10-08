/** Optional alerts on the existing Cloudflare cron; no exchange credentials. */
import type { Env } from "../env";
import type { GridAnalysis, GridMarket } from "@/shared/grid";
import { readGridResearch } from "./grid-market";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
const MARKETS: readonly GridMarket[] = ["spot", "futures"];
const LAST_SWEEP = "grid:radar:v1:last-sweep";

async function notify(env: Env, analysis: GridAnalysis): Promise<void> {
  if (!analysis.plan || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const plan = analysis.plan;
  const message = [
    "网格雷达：研究候选（非下单指令）",
    analysis.symbol + " / " + analysis.kind,
    "参考价 " + analysis.price,
    "参考区间 " + plan.lower + "～" + plan.upper,
    plan.count + " 格 " + plan.spacing,
    "假设成本后单格间距 " + plan.estimatedNetStepPct + "%",
    "未计持仓浮亏、资金费与强平风险；不保证盈利。",
  ].join("\n");
  const response = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
    method: "POST",
    body: new URLSearchParams({ chat_id: env.TELEGRAM_CHAT_ID, text: message }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Telegram push failed with HTTP " + response.status);
}

export async function runScheduledGridRadar(env: Env, now = Date.now()): Promise<void> {
  const previous = Number(await env.SCAN_CACHE.get(LAST_SWEEP));
  if (Number.isFinite(previous) && previous > 0 && now - previous < 15 * 60_000) return;
  await env.SCAN_CACHE.put(LAST_SWEEP, String(now), { expirationTtl: 1200 });
  for (const symbol of SYMBOLS) {
    for (const market of MARKETS) {
      try {
        const result = await readGridResearch(symbol, market, 50, now);
        const dedupe = "grid:radar:v1:sent:" + market + ":" + symbol;
        if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID ||
            result.decision !== "CANDIDATE" || (result.score ?? 0) < 70 ||
            await env.SCAN_CACHE.get(dedupe)) continue;
        await notify(env, result);
        await env.SCAN_CACHE.put(dedupe, String(now), { expirationTtl: 10_800 });
      } catch (error) {
        // Avoid logging secret-bearing request URLs.
        console.warn("网格定时行情不可用", symbol, market,
          error instanceof Error ? error.name : "unknown");
      }
    }
  }
}
