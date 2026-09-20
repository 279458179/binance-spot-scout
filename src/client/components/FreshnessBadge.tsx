import type { ReactNode } from "react";

import { useNow } from "@/client/hooks/useNow";
import { ageMs, formatAge } from "@/client/lib/format";
import { SCAN_CONFIG } from "@/config/strategy";

interface FreshnessBadgeProps {
  generatedAt: string;
  /** Force the stale styling even when the timestamp still looks fresh. */
  stale?: boolean;
}

/** Shows how old the underlying scan data is and warns once it expires. */
export function FreshnessBadge({
  generatedAt,
  stale = false,
}: FreshnessBadgeProps): ReactNode {
  const now = useNow(1000);
  const age = ageMs(generatedAt, now);
  const expired = stale || age > SCAN_CONFIG.dataFreshnessMs;

  if (expired) {
    return (
      <span className="pill bg-honey-950 text-honey-300">
        <span aria-hidden>⚠</span>
        <span>数据可能已过期 · {formatAge(age)}</span>
      </span>
    );
  }

  return (
    <span className="pill bg-white/5 text-ink-300">
      <span aria-hidden>🕒</span>
      <span>数据更新于 {formatAge(age)}</span>
    </span>
  );
}
