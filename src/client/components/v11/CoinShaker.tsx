import type { ReactNode } from "react";
import { motion } from "motion/react";

const coins = [
  { x: "-32%", y: "-8%", delay: 0, emoji: "🟡" },
  { x: "6%", y: "-16%", delay: 0.08, emoji: "🪙" },
  { x: "30%", y: "-4%", delay: 0.04, emoji: "🟡" },
  { x: "-10%", y: "6%", delay: 0.12, emoji: "🪙" },
];

export function CoinShaker(): ReactNode {
  return (
    <section aria-label="摇币机" className="relative mx-auto flex w-full max-w-md flex-col items-center">
      <div className="relative flex h-44 w-64 items-end justify-center rounded-[38px] border border-white/12 bg-[linear-gradient(160deg,rgba(29,31,36,.94),rgba(12,14,17,.88))] shadow-[0_24px_80px_rgba(0,0,0,.38)]">
        <div className="absolute inset-x-5 top-4 h-28 rounded-2xl bg-white/3" />
        {coins.map((coin) => (
          <motion.span
            key={coin.emoji + coin.x}
            className="absolute left-1/2 top-1/2 text-2xl"
            style={{ marginLeft: coin.x, marginTop: coin.y }}
            animate={{ y: [-8, -22, 8], x: [-4, 8, -2], rotate: [-18, 24, -8], opacity: [.72, 1, .82] }}
            transition={{ duration: .72, repeat: Infinity, repeatType: "mirror", ease: "easeInOut", delay: coin.delay }}
          >{coin.emoji}</motion.span>
        ))}
      </div>
      <motion.div
        className="mt-5 h-2 rounded-full bg-[linear-gradient(90deg,#6ff0b4,#34d99a,transparent)]"
        animate={{ scaleX: [.18, .86, .18], opacity: [.38, 1, .38] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        style={{ width: "66%" }}
      />
    </section>
  );
}
