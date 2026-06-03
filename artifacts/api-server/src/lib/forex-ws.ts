import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { logger } from "./logger";

export interface ForexPrice {
  pair: string;
  price: number;
  change: number;
  changePercent: number;
  up: boolean;
  timestamp: number;
}

const BASE_PRICES: Record<string, number> = {
  EURUSD: 1.08245,
  GBPUSD: 1.26340,
  USDJPY: 154.320,
  XAUUSD: 2356.75,
  XAGUSD: 29.450,
  AUDUSD: 0.64210,
  USDCAD: 1.36450,
  BTCUSDT: 67892.11,
};

const DECIMALS: Record<string, number> = {
  EURUSD: 5,
  GBPUSD: 5,
  USDJPY: 3,
  XAUUSD: 2,
  XAGUSD: 3,
  AUDUSD: 5,
  USDCAD: 5,
  BTCUSDT: 2,
};

const VOLATILITY: Record<string, number> = {
  EURUSD: 0.00015,
  GBPUSD: 0.00018,
  USDJPY: 0.022,
  XAUUSD: 0.85,
  XAGUSD: 0.045,
  AUDUSD: 0.00014,
  USDCAD: 0.00013,
  BTCUSDT: 42.0,
};

const currentPrices: Record<string, number> = { ...BASE_PRICES };
const openPrices: Record<string, number> = { ...BASE_PRICES };

function nextPrice(pair: string): ForexPrice {
  const vol = VOLATILITY[pair] ?? 0.001;
  const drift = (Math.random() - 0.49) * vol * 2;
  const prev = currentPrices[pair];
  const next = Math.max(prev + drift, prev * 0.9995);
  currentPrices[pair] = next;

  const dec = DECIMALS[pair] ?? 5;
  const change = next - openPrices[pair];
  const changePercent = (change / openPrices[pair]) * 100;
  const up = change >= 0;

  return {
    pair,
    price: parseFloat(next.toFixed(dec)),
    change: parseFloat(change.toFixed(dec)),
    changePercent: parseFloat(changePercent.toFixed(3)),
    up,
    timestamp: Date.now(),
  };
}

function buildSnapshot(): ForexPrice[] {
  return Object.keys(BASE_PRICES).map(nextPrice);
}

let _wss: WebSocketServer | null = null;

export function broadcastMt5Status(payload: object): void {
  if (!_wss) return;
  const msg = JSON.stringify({ type: "mt5_status", data: payload });
  for (const client of _wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

export type AdminEventType = "new_user" | "payment_completed" | "subscription_activated";

export function broadcastAdminEvent(eventType: AdminEventType, data: Record<string, unknown>): void {
  if (!_wss) return;
  const msg = JSON.stringify({
    type: "admin_event",
    data: { eventType, ...data, ts: Date.now() },
  });
  for (const client of _wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

/**
 * Broadcasts a subscription_activated event to ALL connected clients.
 * Each client filters by userId to decide whether to act on it.
 */
export function broadcastSubscriptionActivated(userId: number, data: Record<string, unknown>): void {
  if (!_wss) return;
  const msg = JSON.stringify({
    type: "subscription_activated",
    data: { userId, ...data, ts: Date.now() },
  });
  for (const client of _wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

export function attachForexWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/api/ws" });
  _wss = wss;

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    logger.info({ ip: req.socket.remoteAddress }, "Forex WS client connected");

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "snapshot", data: buildSnapshot() }));
    }

    ws.on("close", () => {
      logger.info({ ip: req.socket.remoteAddress }, "Forex WS client disconnected");
    });

    ws.on("error", (err) => {
      logger.warn({ err }, "Forex WS client error");
    });
  });

  const PAIRS = Object.keys(BASE_PRICES);
  let tickIndex = 0;

  setInterval(() => {
    if (wss.clients.size === 0) return;

    const updates: ForexPrice[] = [];
    const count = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < count; i++) {
      const pair = PAIRS[(tickIndex + i) % PAIRS.length];
      updates.push(nextPrice(pair));
    }
    tickIndex = (tickIndex + count) % PAIRS.length;

    const msg = JSON.stringify({ type: "tick", data: updates });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }, 800);

  logger.info("Forex WebSocket server attached at /api/ws");
}
