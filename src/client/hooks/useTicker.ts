import { useEffect, useRef, useState } from "react";

import { BINANCE_WS_BASE_URL, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS } from "@/config/api";
import type { TickerPayload, TickerSnapshot } from "@/shared/types";

/** Snapshot shown before the first frame arrives. */
const IDLE_SNAPSHOT: TickerSnapshot = {
  price: 0,
  updatedAt: 0,
  connected: false,
  error: null,
};

/** Milliseconds to wait before reconnecting, doubling per failed attempt. */
function backoffDelay(attempt: number): number {
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
}

/** `BTCUSDT` → `btcusdt@bookTicker`, the stream name Binance expects. */
function streamUrl(symbol: string): string {
  return `${BINANCE_WS_BASE_URL}/${symbol.toLowerCase()}@bookTicker`;
}

/**
 * Subscribes to the best bid/ask stream for a single symbol.
 *
 * Deliberately narrow: only the final candidate is ever subscribed, so a scan
 * of several hundred symbols never turns into several hundred sockets. The
 * connection is dropped as soon as `enabled` flips off or the Symbol changes.
 */
export function useTicker(symbol: string | null, enabled: boolean): TickerSnapshot {
  const [snapshot, setSnapshot] = useState<TickerSnapshot>(IDLE_SNAPSHOT);
  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    let disposed = false;

    const clearTimer = (): void => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const closeSocket = (): void => {
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket !== null) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
    };

    if (!enabled || symbol === null || symbol.length === 0) {
      closeSocket();
      clearTimer();
      setSnapshot(IDLE_SNAPSHOT);
      return () => {
        disposed = true;
      };
    }

    attemptRef.current = 0;
    setSnapshot({ ...IDLE_SNAPSHOT, connected: false, error: null });

    const connect = (): void => {
      if (disposed) {
        return;
      }
      const socket = new WebSocket(streamUrl(symbol));
      socketRef.current = socket;

      socket.onopen = (): void => {
        if (disposed) {
          return;
        }
        attemptRef.current = 0;
        setSnapshot((prev) => ({ ...prev, connected: true, error: null }));
      };

      socket.onmessage = (event: MessageEvent<string>): void => {
        if (disposed) {
          return;
        }
        let payload: TickerPayload;
        try {
          payload = JSON.parse(event.data) as TickerPayload;
        } catch {
          return;
        }
        const bid = Number.parseFloat(payload.b);
        const ask = Number.parseFloat(payload.a);
        if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
          return;
        }
        setSnapshot({
          price: (bid + ask) / 2,
          updatedAt: Date.now(),
          connected: true,
          error: null,
        });
      };

      socket.onerror = (): void => {
        if (disposed) {
          return;
        }
        setSnapshot((prev) => ({ ...prev, connected: false, error: "行情连接异常" }));
      };

      socket.onclose = (): void => {
        if (disposed) {
          return;
        }
        socketRef.current = null;
        const delay = backoffDelay(attemptRef.current);
        attemptRef.current += 1;
        setSnapshot((prev) => ({ ...prev, connected: false, error: "行情连接已断开" }));
        clearTimer();
        timerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimer();
      closeSocket();
    };
  }, [symbol, enabled]);

  return snapshot;
}
