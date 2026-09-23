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
      className="w-full rounded-[var(--radius-md)] border border-[rgba(111,240,180,.32)] bg-[linear-gradient(135deg,rgba(52,217,154,.20),rgba(29,31,36,.94))] px-5 py-4 text-base font-semibold text-[var(--text-primary)] shadow-[0_14px_38px_rgba(52,217,154,.16)] transition hover:border-[rgba(111,240,180,.55)] disabled:cursor-not-allowed disabled:text-[#676b74]"
    >
      {loading ? "正在摇币…" : "🎲 摇币"}
    </motion.button>
  );
}
