import { useEffect, useRef, useState } from "react";

import { describeError, fetchLatestScan } from "@/client/lib/api";
import type { ScanResponse } from "@/client/lib/api";

/** State machine for the first-paint `GET /api/latest` fetch. */
export interface UseLatestScanResult {
  data: ScanResponse | null;
  error: string | null;
  loading: boolean;
  /** Re-runs the request, used by the "重新扫描" affordance. */
  reload: () => void;
}

/**
 * Loads the most recent scan on mount so the home page never shows a blank
 * screen. A cold KV cache makes the server run a full scan, which is why the
 * initial load can take a few seconds.
 */
export function useLatestScan(): UseLatestScanResult {
  const [data, setData] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const payload = await fetchLatestScan();
        if (!cancelled.current) {
          setData(payload);
        }
      } catch (cause) {
        if (!cancelled.current) {
          setError(describeError(cause));
        }
      } finally {
        if (!cancelled.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled.current = true;
    };
  }, [attempt]);

  const reload = (): void => {
    setAttempt((value) => value + 1);
  };

  return { data, error, loading, reload };
}
