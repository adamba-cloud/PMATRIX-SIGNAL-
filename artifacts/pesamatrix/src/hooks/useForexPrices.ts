import { useEffect, useRef, useState, useCallback } from "react";

export interface ForexPrice {
  pair: string;
  price: number;
  change: number;
  changePercent: number;
  up: boolean;
  timestamp: number;
}

type PriceMap = Record<string, ForexPrice>;

const WS_RECONNECT_DELAY_MS = 3000;
const WS_MAX_RECONNECTS = 10;

export function useForexPrices() {
  const [prices, setPrices] = useState<PriceMap>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/api/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectCount.current = 0;
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as
          | { type: "snapshot"; data: ForexPrice[] }
          | { type: "tick"; data: ForexPrice[] };

        setPrices((prev) => {
          const next = { ...prev };
          for (const p of msg.data) {
            next[p.pair] = p;
          }
          return next;
        });
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (unmounted.current) return;
      if (reconnectCount.current < WS_MAX_RECONNECTS) {
        reconnectCount.current += 1;
        reconnectTimer.current = setTimeout(connect, WS_RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { prices, connected };
}
