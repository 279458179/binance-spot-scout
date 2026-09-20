import { useEffect, useRef, useState } from "react";

import { describeError, fetchSymbolDetail } from "@/client/lib/api";
import type { SymbolDetail } from "@/shared/types";

/** Result shape of `useSymbolDetail`. */
export interface UseSymbolDetailResult {
  detail: SymbolDetail | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads the deep metrics for one symbol. `symbol` is nullable so callers can
 * keep the hook mounted while no candidate is selected — nothing is fetched
 * until a symbol is available.
 */
export function useSymbolDetail(symbol: string | null): UseSymbolDetailResult {
  const [detail, setDetail] = useState<SymbolDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;

    if (symbol === null || symbol.length === 0) {
      setDetail(null);
      setError(null);
      setLoading(false);
      return () => {
        cancelled.current = true;
      };
    }

    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const payload = await fetchSymbolDetail(symbol);
        if (!cancelled.current) {
          setDetail(payload);
        }
      } catch (cause) {
        if (!cancelled.current) {
          setDetail(null);
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
  }, [symbol, attempt]);

  const reload = (): void => {
    setAttempt((value) => value + 1);
  };

  return { detail, error, loading, reload };
}
