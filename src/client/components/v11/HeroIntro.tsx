import type { ReactNode } from "react";
import { motion } from "motion/react";

export function HeroIntro(): ReactNode {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
      <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">当前市场，我只替你挑一个。</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
        扫描 Binance USDT 现货，比较趋势、动量、流动性与入场结构，给你当前市场的相对最优候选。
      </p>
    </motion.section>
  );
}
