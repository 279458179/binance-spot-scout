import type { ReactNode } from "react";
import { motion } from "motion/react";

export function ScanVisual(): ReactNode {
  return (
    <div aria-hidden className="relative flex aspect-square w-full max-w-[520px] items-center justify-center overflow-hidden rounded-[var(--radius-xl)] bg-[var(--bg-secondary)]">
      <div className="absolute inset-8 rounded-full border border-[var(--border-soft)]" />
      <div className="absolute inset-20 rounded-full border border-[var(--divider)]" />
      <div className="absolute inset-32 rounded-full border border-[var(--divider)]" />
      <motion.div
        className="absolute left-1/2 top-1/2 h-[calc(50%-2rem)] w-px origin-bottom bg-gradient-to-t from-[rgba(0,113,227,.64)] via-[rgba(0,113,227,.18)] to-transparent"
        initial={{ rotate: 0 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "linear" }}
      />
      <div className="size-2.5 rounded-full bg-[var(--brand-primary)]" />
    </div>
  );
}
