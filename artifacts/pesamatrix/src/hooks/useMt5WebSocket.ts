import { useEffect, useRef, useCallback } from "react";

export interface Mt5StatusPush {
  accountId: number;
  userId: number;
  status: string;
  statusMessage: string | null;
  lastSyncAt: string | null;
  updatedAt: string;
  telemetry?: {
    connectionStatus?: string;
    synchronizationStatus?: string;
    state?: string;
    balance?: number | null;
    equity?: number | null;
    margin?: number | null;
    freeMargin?: number | null;
    leverage?: number | null;
    currency?: string | null;
    broker?: string | null;
    tradeAllowed?: boolean | null;
  };
}

const WS_RECONNECT_DELAY_MS = 3000;
const WS_MAX_RECONNECTS = 10;

export function useMt5WebSocket(onStatusUpdate: (update: Mt5StatusPush) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);
  const callbackRef = useRef(onStatusUpdate);
  callbackRef.current = onStatusUpdate;

  const connect = useCallback(() => {
    if (unmounted.current) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/api/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectCount.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; data: unknown };
        if (msg.type === "mt5_status") {
          callbackRef.current(msg.data as Mt5StatusPush);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
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
}
