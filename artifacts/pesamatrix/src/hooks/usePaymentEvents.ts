import { useEffect, useRef } from "react";

export interface SubscriptionActivatedPayload {
  userId: number;
  subscriptionId: number;
  endDate: string | null;
  daysSelected: number;
  receipt: string | null;
  source: "callback" | "verify" | "reconciler";
  ts: number;
}

type Handler = (payload: SubscriptionActivatedPayload) => void;

/**
 * Listens on the existing /api/ws WebSocket for `subscription_activated` events.
 * Calls `onActivated` when the server broadcasts activation for the given userId.
 * Reuses the same socket path as the forex ticker — no extra connection.
 */
export function usePaymentEvents(userId: number | undefined, onActivated: Handler) {
  const handlerRef = useRef<Handler>(onActivated);
  handlerRef.current = onActivated;

  useEffect(() => {
    if (!userId) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/api/ws`;

    let ws: WebSocket | null = null;
    let dead = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (dead) return;
      ws = new WebSocket(url);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type: string; data: unknown };
          if (msg.type !== "subscription_activated") return;
          const payload = msg.data as SubscriptionActivatedPayload;
          if (payload.userId !== userId) return;
          handlerRef.current(payload);
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (dead) return;
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws?.close();
    }

    connect();

    return () => {
      dead = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [userId]);
}
