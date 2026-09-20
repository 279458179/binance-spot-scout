/**
 * The loading mascot: one paw that bounces while a scan is running.
 */

import { motion } from "motion/react";

import { pawBounce } from "@/client/animations/variants";

/** Bouncing paw plus a rotating hint line. */
export function LoadingPaw({ hint = "正在翻遍整个市场…" }: { hint?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-10 text-center"
      role="status"
      aria-live="polite"
    >
      <motion.span
        className="text-4xl"
        variants={pawBounce}
        initial="idle"
        animate="loading"
        aria-hidden="true"
      >
        🐾
      </motion.span>
      <p className="text-sm text-ink-300">{hint}</p>
      <p className="text-xs text-ink-500">通常需要 3–10 秒，请别刷新页面。</p>
    </div>
  );
}
