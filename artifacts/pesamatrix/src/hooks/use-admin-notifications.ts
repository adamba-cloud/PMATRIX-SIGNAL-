import { useState, useEffect, useRef, useCallback } from "react";

export interface AdminNotification {
  id: string;
  eventType:
    | "new_user"
    | "payment_completed"
    | "subscription_activated"
    | "copy_trade_fan_out"
    | "ad_approval_request";
  ts: number;
  [key: string]: unknown;
}

const MAX_STORED = 100;

export function useAdminNotifications() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type !== "admin_event") return;
        const data = msg.data as AdminNotification;
        const notif: AdminNotification = {
          ...data,
          id: `${data.ts}-${Math.random().toString(36).slice(2)}`,
        };
        setNotifications((prev) => [notif, ...prev].slice(0, MAX_STORED));
        setUnread((n) => n + 1);
      } catch {}
    };

    ws.onclose = () => {
      reconnectTimer.current = setTimeout(connect, 4000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const markAllRead = useCallback(() => setUnread(0), []);
  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnread(0);
  }, []);

  const removeOne = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notifications, unread, markAllRead, clearAll, removeOne };
}
