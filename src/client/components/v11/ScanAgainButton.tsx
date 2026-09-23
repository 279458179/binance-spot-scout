import type { ReactNode } from "react";
import { motion } from "motion/react";

import { pressable } from "@/client/animations/variants";

export function ScanAgainButton({ onClick, loading, disabled = false }: { onClick: () => void; loading: boolean; disabled?: boolean }): ReactNode {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      {...pressable}
      className="w-full rounded-full bg-[var(--brand-primary)] px-7 py-4 text-base font-medium text-white transition-colors hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:bg-[rgba(0,0,0,.08)] disabled:text-[var(--text-quaternary)]"
    >
      {loading ? "正在扫描" : "重新扫描"}
    </motion.button>
  );
}
