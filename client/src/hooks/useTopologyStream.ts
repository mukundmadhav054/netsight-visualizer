import { useEffect, useRef, useState } from "react";
import { useGraphStore, type GraphDelta } from "../store/graphStore";

export type StreamStatus = "connecting" | "open" | "reconnecting" | "closed";

interface Options {
  /** Base delay for exponential backoff (ms). */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Flush buffered packets at most this often (ms). */
  flushIntervalMs?: number;
}

function backoff(attempt: number, base: number, max: number): number {
  const jitter = Math.random() * 250;
  return Math.min(max, base * 2 ** attempt) + jitter;
}

/**
 * Resilient topology stream hook.
 * - Auto-reconnects with exponential backoff + jitter.
 * - Buffers incoming delta packets and flushes them on an interval so a
 *   500-node burst never triggers 500 synchronous store writes / renders.
 * - Drops stale packets via the store's sequence guard.
 */
export function useTopologyStream(url: string, opts: Options = {}) {
  const { baseDelayMs = 1000, maxDelayMs = 30000, flushIntervalMs = 250 } = opts;
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [buffered, setBuffered] = useState(0);
  const attemptRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<GraphDelta[]>([]);
  const timerRef = useRef<number | null>(null);
  const closedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;

    const flush = () => {
      const batch = queueRef.current.splice(0, queueRef.current.length);
      if (batch.length === 0) {
        setBuffered(0);
        return;
      }
      // Oldest-first so the seq guard keeps ordering deterministic.
      batch.sort((a, b) => a.seq - b.seq);
      const applyDelta = useGraphStore.getState().applyDelta;
      for (const d of batch) applyDelta(d);
      setBuffered(queueRef.current.length);
    };

    const connect = () => {
      if (closedRef.current) return;
      setStatus(attemptRef.current === 0 ? "connecting" : "reconnecting");
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        schedule();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        setStatus("open");
      };
      ws.onmessage = (ev: MessageEvent) => {
        try {
          const msg = JSON.parse(String(ev.data)) as
            | { type: "delta"; delta: GraphDelta }
            | { type: "snapshot"; delta: GraphDelta }
            | { type: "heartbeat"; ts: number };
          if (msg.type === "heartbeat") return;
          queueRef.current.push(msg.delta);
          setBuffered(queueRef.current.length);
        } catch {
          // Ignore malformed packets; stream stays alive.
        }
      };
      ws.onerror = () => {
        ws.close();
      };
      ws.onclose = () => {
        if (!closedRef.current) schedule();
        else setStatus("closed");
      };
    };

    const schedule = () => {
      const delay = backoff(attemptRef.current, baseDelayMs, maxDelayMs);
      attemptRef.current += 1;
      setStatus("reconnecting");
      window.setTimeout(() => {
        if (!closedRef.current) connect();
      }, delay);
    };

    connect();
    timerRef.current = window.setInterval(flush, flushIntervalMs);

    return () => {
      closedRef.current = true;
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      wsRef.current?.close();
    };
    // Reconnect only when the URL changes; options are startup config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return { status, buffered };
}
