import { useEffect, useRef, useState } from "react";

import { describeError, fetchHistory } from "@/client/lib/api";
import type { HistoryEntry } from "@/shared/types";

/** Result shape of `useHistory`, one entry per past scan. */
export interface UseHistoryResult {
  entries: HistoryEntry[];
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads past scan rows from D1. History is a nice-to-have: a failure here must
 * degrade to an empty list rather than breaking the page.
 */
export function useHistory(limit = 20): UseHistoryResult {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
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
        const rows = await fetchHistory(limit);
        if (!cancelled.current) {
          setEntries(rows);
        }
      } catch (cause) {
        if (!cancelled.current) {
          setEntries([]);
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
  }, [limit, attempt]);

  const reload = (): void => {
    setAttempt((value) => value + 1);
  };

  return { entries, error, loading, reload };
}
