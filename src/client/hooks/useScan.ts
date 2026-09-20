import { useCallback, useRef, useState } from "react";

import { describeError, requestScan } from "@/client/lib/api";
import type { ScanResponse } from "@/client/lib/api";

/** State machine for the manual "帮我选一个" scan triggered from the home page. */
export interface UseScanResult {
  data: ScanResponse | null;
  error: string | null;
  loading: boolean;
  /** Runs a fresh scan; resolves once the request settles. */
  run: () => Promise<void>;
  /** Clears the previous error before a retry. */
  reset: () => void;
}

/**
 * Owns the `POST /api/scan` request. The server enforces a cooldown, so a
 * repeated click simply returns the cached payload instead of failing.
 */
export function useScan(): UseScanResult {
  const [data, setData] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(async (): Promise<void> => {
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      const payload = await requestScan();
      setData(payload);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  const reset = useCallback((): void => {
    setError(null);
  }, []);

  return { data, error, loading, run, reset };
}
