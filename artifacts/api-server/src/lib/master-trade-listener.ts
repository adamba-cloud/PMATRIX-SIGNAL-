import { db, masterTradeEventsTable, systemConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAccountPositions, type MetaApiPosition } from "./metaapi";
import { broadcastMasterTradeEvent } from "./forex-ws";
import { getMasterTradeExecutionQueue } from "./master-trade-execution-queue";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 10_000;

// Backoff state — when the account is unreachable (504, UNDEPLOYED) we
// skip poll cycles instead of hammering MetaApi every 10 s with doomed requests.
// Backoff levels (in skipped cycles): 0→0, 1→3 (30s), 2→12 (2min), 3→30 (5min), 4+→60 (10min)
const BACKOFF_SKIPS = [0, 3, 12, 30, 60];
let consecutiveErrors = 0;
let skipsRemaining = 0;

type PositionSnapshot = Map<string, MetaApiPosition>;

let previousSnapshot: PositionSnapshot = new Map();
let isRunning = false;

// ── Account ID resolution ─────────────────────────────────────────────────────
// Read from system_config first, fall back to env var. Returns null if neither
// is set so the listener skips the poll cycle instead of hitting a bad ID.

async function resolveAccountId(): Promise<string | null> {
  const envId = process.env.MASTER_TRADE_ACCOUNT_ID ?? null;
  try {
    const [row] = await db
      .select({ value: systemConfigTable.value })
      .from(systemConfigTable)
      .where(eq(systemConfigTable.key, "masterMetaApiAccountId"))
      .limit(1);
    return row?.value ?? envId;
  } catch {
    return envId;
  }
}

// ── Event insert + queue enqueue ──────────────────────────────────────────────

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
    jobStatus: "PENDING" as const,
  };

  const [inserted] = await db
    .insert(masterTradeEventsTable)
    .values(row)
    .returning({ id: masterTradeEventsTable.id });

  logger.info(
    { eventId: inserted.id, eventType, positionId: position.id, symbol: position.symbol },
    "[MasterTradeListener] Event saved to database"
  );

  // ── Enqueue execution job ─────────────────────────────────────────────────
  try {
    const queue = getMasterTradeExecutionQueue();
    const jobName = `master-trade:${eventType}:${position.id}:${inserted.id}`;

    const jobData = {
      eventId: inserted.id,
      eventType,
      metaApiAccountId: accountId,
      positionId: position.id,
      symbol: position.symbol,
      direction: row.direction,
      volume: position.volume ?? null,
      openPrice: position.openPrice ?? null,
      stopLoss: position.stopLoss ?? null,
      takeProfit: position.takeProfit ?? null,
      changedFields: changedFields ?? null,
    };

    logger.info(
      { eventId: inserted.id, eventType, positionId: position.id, symbol: position.symbol },
      "[MasterTradeListener] Job Created"
    );

    const job = await queue.add(jobName, jobData);

    await db
      .update(masterTradeEventsTable)
      .set({ jobId: job.id ?? null, jobStatus: "QUEUED" })
      .where(eq(masterTradeEventsTable.id, inserted.id));

    logger.info(
      { jobId: job.id, jobName, eventId: inserted.id, eventType, symbol: position.symbol, direction: row.direction },
      "[MasterTradeListener] Queue Added"
    );
  } catch (queueErr) {
    logger.warn(
      {
        err: queueErr instanceof Error ? { message: queueErr.message, code: (queueErr as NodeJS.ErrnoException).code } : String(queueErr),
        eventId: inserted.id,
        eventType,
        symbol: position.symbol,
      },
      "[MasterTradeListener] Failed to enqueue job — Redis may be unavailable"
    );
  }

  // ── WebSocket broadcast ───────────────────────────────────────────────────
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

  // Backoff: skip this cycle if we're still waiting out previous errors
  if (skipsRemaining > 0) {
    skipsRemaining--;
    return;
  }

  const accountId = await resolveAccountId();

  if (!accountId) {
    // No ID configured yet — wait silently until admin saves one
    return;
  }

  let positions: MetaApiPosition[];
  try {
    positions = await getAccountPositions(accountId);
    // Success — reset backoff
    if (consecutiveErrors > 0) {
      logger.info({ accountId }, "[MasterTradeListener] Account reachable again — backoff reset");
      consecutiveErrors = 0;
    }
  } catch (err) {
    consecutiveErrors++;
    const level = Math.min(consecutiveErrors, BACKOFF_SKIPS.length - 1);
    skipsRemaining = BACKOFF_SKIPS[level];

    const msg = err instanceof Error ? err.message : "";
    const isTransient =
      msg.includes("(504)") ||
      msg.includes("TimeoutError") ||
      msg.includes("not connected to broker") ||
      msg.includes("does not match the account region") ||
      msg.includes("UNDEPLOYED") ||
      msg.includes("(404)");

    if (isTransient) {
      // Account offline / undeployed / wrong region — don't flood logs
      logger.debug(
        { accountId, consecutiveErrors, backoffCycles: skipsRemaining },
        "[MasterTradeListener] Account unreachable (transient) — backing off"
      );
    } else {
      logger.warn(
        { err, accountId, consecutiveErrors, backoffCycles: skipsRemaining },
        "[MasterTradeListener] Failed to fetch positions — will retry with backoff"
      );
    }
    return;
  }

  const currentSnapshot: PositionSnapshot = new Map(positions.map((p) => [p.id, p]));
  const events: Promise<void>[] = [];

  for (const [id, curr] of currentSnapshot) {
    const prev = previousSnapshot.get(id);
    if (!prev) {
      logger.info({ positionId: id, symbol: curr.symbol }, "[MasterTradeListener] POSITION_OPENED detected");
      events.push(insertEvent(accountId, "POSITION_OPENED", curr));
    } else {
      const changed = detectChanges(prev, curr);
      if (changed.length > 0) {
        logger.info(
          { positionId: id, symbol: curr.symbol, changed },
          "[MasterTradeListener] POSITION_MODIFIED detected"
        );
        events.push(insertEvent(accountId, "POSITION_MODIFIED", curr, changed.join(",")));
      }
    }
  }

  for (const [id, prev] of previousSnapshot) {
    if (!currentSnapshot.has(id)) {
      logger.info({ positionId: id, symbol: prev.symbol }, "[MasterTradeListener] POSITION_CLOSED detected");
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
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "[MasterTradeListener] Started");
}
