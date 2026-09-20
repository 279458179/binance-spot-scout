import { useEffect, useState } from "react";

/**
 * Returns a timestamp that ticks every `intervalMs`, used to keep relative
 * freshness labels ("数据更新于 12 秒前") live without re-fetching data.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}
