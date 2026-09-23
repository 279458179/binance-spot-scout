import type { ReactNode } from "react";
import { motion } from "motion/react";

export function HeroIntro(): ReactNode {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
      <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">摇一次，出一只。</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
        点下摇币机，后台会按行情、流动性与入场结构排序；即使市场偏弱，也会交出一只相对最优候选。
      </p>
    </motion.section>
  );
}
