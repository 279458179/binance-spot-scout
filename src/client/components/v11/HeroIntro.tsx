import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ScanVisual } from "@/client/components/home/ScanVisual";

export function HeroIntro(): ReactNode {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
      <h1 className="max-w-[18ch] text-[2.5rem] font-semibold leading-[1.08] tracking-[-0.04em] sm:text-[3.5rem] lg:text-[4rem]">
        找到今天值得盯的币。
      </h1>
      <p className="mt-4 max-w-[28ch] text-[17px] leading-7 text-[var(--text-secondary)] sm:max-w-[36ch]">
        一键扫描 Binance 现货，按流动性、趋势与风险给出一个明确候选。
      </p>
      <div className="mt-14 sm:mt-20">
        <ScanVisual />
      </div>
    </motion.section>
  );
}
