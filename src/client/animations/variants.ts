/**
 * Shared motion variants.
 *
 * Kept in one place so the whole app moves at the same speed: cards lift in,
 * panels fade, and the loading paw keeps bouncing while a scan is in flight.
 */

import type { Variants } from "motion/react";

/** Default entrance for a card or panel. */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: "easeOut" },
  },
};

/** Simple cross-fade, used when swapping one decision card for another. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.22, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.14, ease: "easeIn" } },
};

/** Parent wrapper that walks its children in one after another. */
export const staggerList: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

/** Child row for `staggerList`. */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.26, ease: "easeOut" } },
};

/** Score ring sweep — the arc animates from zero on every new result. */
export const ringDraw: Variants = {
  hidden: { pathLength: 0 },
  visible: {
    pathLength: 1,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

/** Loading paw: a slow three-frame bounce. */
export const pawBounce: Variants = {
  idle: { y: 0, rotate: 0 },
  loading: {
    y: [0, -7, 0],
    rotate: [0, -8, 0],
    transition: { duration: 1.1, repeat: Infinity, ease: "easeInOut" },
  },
};

/** Press feedback for the primary button. */
export const pressable = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.97 },
} as const;
