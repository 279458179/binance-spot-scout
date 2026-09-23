import type { ReactNode } from "react";
import { motion } from "motion/react";

export function ScanOrb(): ReactNode {
  return (
    <div aria-hidden className="relative mx-auto flex size-40 items-center justify-center">
      <motion.div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(52,217,154,.32),transparent_68%)]" animate={{ opacity: [.55, .9, .55], scale: [.96, 1.03, .96] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }} />
      {[0, 1, 2].map((ring) => (
        <motion.span key={ring} className="absolute inset-6 rounded-full border border-[rgba(111,240,180,.14)]" animate={{ scale: [.75, 1.14], opacity: [.34, 0] }} transition={{ duration: 2.8, delay: ring * 0.92, repeat: Infinity, ease: "easeOut" }} />
      ))}
      <motion.span className="absolute inset-0 rounded-full border border-[rgba(111,240,180,.22)]" style={{ clipPath: "polygon(0 0, 50% 0, 50% 100%, 0 100%)" }} animate={{ rotate: 360 }} transition={{ duration: 5.5, repeat: Infinity, ease: "linear" }} />
      <span className="size-3 rounded-full bg-[#6ff0b4] shadow-[0_0_24px_rgba(111,240,180,.72)]" />
    </div>
  );
}
