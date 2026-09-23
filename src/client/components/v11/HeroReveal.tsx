import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ScanOrb } from "./ScanOrb";

export function HeroReveal({ children, visible }: { children: ReactNode; visible: boolean }): ReactNode {
  if (!visible) {
    return <ScanOrb />;
  }
  return <motion.div className="w-full" initial={{ opacity: 0, filter: "blur(14px)", scale: .985 }} animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }} transition={{ duration: .62, ease: [0.16, 1, 0.3, 1] }}>{children}</motion.div>;
}
