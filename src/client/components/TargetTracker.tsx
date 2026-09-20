import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

import { fadeIn } from "@/client/animations/variants";
import { useNow } from "@/client/hooks/useNow";
import { useTicker } from "@/client/hooks/useTicker";
import { formatPercent, formatPrice } from "@/client/lib/format";

interface TargetTrackerProps {
  /** Symbol to watch, e.g. `BTCUSDT`. */
  symbol: string;
  /** Price the trade idea was anchored to. Zero falls back to the first tick. */
  referencePrice: number;
  /** Take-profit distance in percent, e.g. `5`. */
  targetPct: number;
  /** Called when the visitor stops watching. */
  onStop?: () => void;
}

/** Clamps a ratio into `[0, 1]` so a runaway tick cannot overflow the track. */
function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/**
 * Plays a short two-tone chime with the Web Audio API.
 *
 * Synthesized on the spot instead of shipping an asset: one less request, and
 * the tone can be tuned right here. Safe to call before the visitor interacts
 * with the page — `close()` on a suspended context is harmless.
 */
function playChime(): void {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor === undefined) {
    return;
  }
  const context = new Ctor();
  const notes = [880, 1320];
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    const startAt = context.currentTime + index * 0.16;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.15);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.16);
  });
  window.setTimeout(() => {
    void context.close().catch(() => undefined);
  }, 600);
}

/**
 * Live view of the final candidate against its reference price.
 *
 * Online only while this component is mounted, which is why the parent mounts
 * it for the single symbol that survived the funnel — never for the whole
 * market. Read-only: it watches a price and celebrates, it never trades.
 */
export function TargetTracker({
  symbol,
  referencePrice,
  targetPct,
  onStop,
}: TargetTrackerProps): ReactNode {
  const snapshot = useTicker(symbol, true);
  const now = useNow(1000);
  const [soundOn, setSoundOn] = useState(true);
  const notifiedRef = useRef(false);
  const [startedAt] = useState<number>(() => Date.now());
  const [trackingPrice] = useState<number | null>(() =>
    Number.isFinite(referencePrice) && referencePrice > 0 ? referencePrice : null,
  );

  const live = snapshot.updatedAt > 0 && snapshot.price > 0 ? snapshot.price : null;
  const anchor = trackingPrice ?? live;
  const targetPrice = anchor !== null ? anchor * (1 + targetPct / 100) : null;
  const changePct = anchor !== null && live !== null ? (live / anchor - 1) * 100 : null;
  const progress =
    anchor !== null && live !== null && targetPct > 0
      ? clampRatio(((live / anchor - 1) * 100) / targetPct)
      : 0;
  const reached = live !== null && targetPrice !== null && live >= targetPrice;
  const elapsedMs = Math.max(0, now - startedAt);

  useEffect(() => {
    if (!reached || notifiedRef.current) {
      return;
    }
    notifiedRef.current = true;
    if (soundOn) {
      playChime();
    }
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      return;
    }
    try {
      new Notification("币喵雷达 · 达到目标", {
        body: `${symbol} 已上涨 ${formatPercent(changePct)}，触及 +${String(targetPct)}% 目标。`,
      });
    } catch {
      /* Notification can throw on some platforms; the banner stays advisory. */
    }
  }, [reached, soundOn, symbol, targetPct, changePct]);

  return (
    <div className="space-y-4 rounded-2xl border border-white/5 bg-white/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="field-label">实时追踪</h3>
        <span className="flex items-center gap-2 text-xs text-ink-400">
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              snapshot.connected ? "bg-mint-400" : "bg-honey-400"
            }`}
          />
          {snapshot.connected ? "已连接" : "连接中…"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <p className="field-label">追踪起点</p>
          <p className="field-value tabular">{formatPrice(anchor)}</p>
        </div>
        <div>
          <p className="field-label">当前价</p>
          <p className="field-value tabular">{live === null ? "—" : formatPrice(live)}</p>
        </div>
        <div>
          <p className="field-label">涨跌</p>
          <p
            className={`field-value tabular ${
              changePct !== null && changePct >= 0 ? "text-mint-300" : "text-coral-300"
            }`}
          >
            {changePct === null ? "—" : formatPercent(changePct)}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-xs text-ink-400">
          <span>目标 +{targetPct}%</span>
          <span className="tabular">
            {targetPrice === null ? "—" : formatPrice(targetPrice)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-label={`距离 +${String(targetPct)}% 目标的进度`}
          className="h-1.5 w-full overflow-hidden rounded-full bg-white/5"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${
              reached ? "bg-mint-400" : "bg-mint-500/70"
            }`}
            style={{ width: `${String(progress * 100)}%` }}
          />
        </div>
        <p className="text-xs text-ink-500">已追踪 {Math.floor(elapsedMs / 1000)} 秒</p>
      </div>

      {live === null ? <p className="text-sm text-ink-400">正在等待第一笔行情…</p> : null}

      {snapshot.error !== null ? (
        <p className="text-sm text-honey-300">{snapshot.error}，正在自动重连…</p>
      ) : null}

      {reached ? (
        <motion.div
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className="rounded-2xl bg-mint-950 px-4 py-3 text-sm font-semibold text-mint-300"
        >
          🎉 达到 +{targetPct}% 目标啦！当前 {formatPercent(changePct)}
        </motion.div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-ink-300">
          <input
            type="checkbox"
            checked={soundOn}
            onChange={(event) => {
              setSoundOn(event.target.checked);
              if (event.target.checked) {
                playChime();
              }
            }}
            className="h-3.5 w-3.5 accent-mint-500"
          />
          达标提示音
        </label>
        {onStop !== undefined ? (
          <button
            type="button"
            onClick={onStop}
            className="ml-auto rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-ink-200"
          >
            停止追踪
          </button>
        ) : null}
      </div>

      <p className="text-xs leading-relaxed text-ink-500">
        行情来自 Binance 现货最优买卖价，仅供参考，不构成投资建议。
      </p>
    </div>
  );
}
