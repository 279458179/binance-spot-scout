import type { ReactNode } from "react";
import { motion } from "motion/react";

import { pressable } from "@/client/animations/variants";

interface ScanButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  loadingLabel?: string;
  className?: string;
}

/** Primary call-to-action: one tap, one candidate. */
export function ScanButton({
  onClick,
  loading = false,
  disabled = false,
  label = "帮我选一个",
  loadingLabel = "扫描中…",
  className = "",
}: ScanButtonProps): ReactNode {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      {...pressable}
      className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-mint-500 px-5 py-3.5 text-base font-semibold text-night-950 transition-colors disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-ink-400 ${className}`}
    >
      <span aria-hidden>{loading ? "⏳" : "🐾"}</span>
      <span>{loading ? loadingLabel : label}</span>
    </motion.button>
  );
}
