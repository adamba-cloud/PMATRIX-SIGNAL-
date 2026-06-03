import { db, masterTradeEventsTable } from "@workspace/db";
import { getAccountPositions, type MetaApiPosition } from "./metaapi";
import { broadcastMasterTradeEvent } from "./forex-ws";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 10_000;
const DEFAULT_MASTER_ID = "99a2b763-0528-4b0e-91ea-79c0be291d5b";

type PositionSnapshot = Map<string, MetaApiPosition>;

let previousSnapshot: PositionSnapshot = new Map();
let isRunning = false;

function getAccountId(): string {
  return process.env.MASTER_TRADE_ACCOUNT_ID ?? DEFAULT_MASTER_ID;
}

async function insertEvent(
  accountId: string,
  eventType: "POSITION_OPENED" | "POSITION_MODIFIED" | "POSITION_CLOSED",
  position: MetaApiPosition,
  changedFields?: string
): Promise<void> {
  const row = {
    metaApiAccountId: accountId,
    eventType,
    positionId: position.id,
    symbol: position.symbol,
    direction: position.type === "POSITION_TYPE_BUY" ? "BUY" : "SELL",
    volume: position.volume != null ? String(position.volume) : null,
    openPrice: position.openPrice != null ? String(position.openPrice) : null,
    currentPrice: position.currentPrice != null ? String(position.currentPrice) : null,
    stopLoss: position.stopLoss != null ? String(position.stopLoss) : null,
    takeProfit: position.takeProfit != null ? String(position.takeProfit) : null,
    profit: position.profit != null ? String(position.profit) : null,
    comment: position.comment ?? null,
    changedFields: changedFields ?? null,
    rawPayload: JSON.stringify(position),
  };

  await db.insert(masterTradeEventsTable).values(row);

  broadcastMasterTradeEvent({
    eventType,
    positionId: position.id,
    symbol: position.symbol,
    direction: row.direction,
    changedFields: changedFields ?? null,
    ts: Date.now(),
  });
}

function detectChanges(prev: MetaApiPosition, curr: MetaApiPosition): string[] {
  const changed: string[] = [];
  if (prev.volume !== curr.volume) changed.push("volume");
  if (prev.stopLoss !== curr.stopLoss) changed.push("stopLoss");
  if (prev.takeProfit !== curr.takeProfit) changed.push("takeProfit");
  if (prev.openPrice !== curr.openPrice) changed.push("openPrice");
  if (prev.type !== curr.type) changed.push("type");
  return changed;
}

async function poll(): Promise<void> {
  if (!process.env.METAAPI_TOKEN) return;

  const accountId = getAccountId();

  let positions: MetaApiPosition[];
  try {
    positions = await getAccountPositions(accountId);
  } catch (err) {
    logger.warn({ err, accountId }, "[MasterTradeListener] Failed to fetch positions");
    return;
  }

  const currentSnapshot: PositionSnapshot = new Map(positions.map((p) => [p.id, p]));

  const events: Promise<void>[] = [];

  for (const [id, curr] of currentSnapshot) {
    const prev = previousSnapshot.get(id);
    if (!prev) {
      logger.info({ positionId: id, symbol: curr.symbol }, "[MasterTradeListener] POSITION_OPENED");
      events.push(insertEvent(accountId, "POSITION_OPENED", curr));
    } else {
      const changed = detectChanges(prev, curr);
      if (changed.length > 0) {
        logger.info(
          { positionId: id, symbol: curr.symbol, changed },
          "[MasterTradeListener] POSITION_MODIFIED"
        );
        events.push(insertEvent(accountId, "POSITION_MODIFIED", curr, changed.join(",")));
      }
    }
  }

  for (const [id, prev] of previousSnapshot) {
    if (!currentSnapshot.has(id)) {
      logger.info({ positionId: id, symbol: prev.symbol }, "[MasterTradeListener] POSITION_CLOSED");
      events.push(insertEvent(accountId, "POSITION_CLOSED", prev));
    }
  }

  await Promise.allSettled(events);
  previousSnapshot = currentSnapshot;
}

export function startMasterTradeListener(): void {
  if (!process.env.METAAPI_TOKEN) {
    logger.warn("[MasterTradeListener] METAAPI_TOKEN not set — listener will not start");
    return;
  }

  if (isRunning) return;
  isRunning = true;

  poll();
  setInterval(poll, POLL_INTERVAL_MS);
  logger.info({ intervalMs: POLL_INTERVAL_MS, accountId: getAccountId() }, "[MasterTradeListener] Started");
}
