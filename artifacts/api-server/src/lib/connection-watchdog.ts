/**
 * Master Connection Kill Switch
 *
 * Every 10 seconds, checks that every master account (those with active copy
 * links) has sent a heartbeat recently. The master poller calls
 * `updateMasterHeartbeat()` on every successful position fetch.
 *
 * If a master has been silent for more than 60 seconds:
 *   - The BullMQ copy-trade queue is paused (stops processing new jobs)
 *   - An EMERGENCY_PAUSE event is written to the audit log and a Redis flag is set
 *
 * When ALL masters recover (heartbeat resumes):
 *   - The queue is resumed
 *   - An EMERGENCY_RESOLVED event is written
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { db, slaveAccountsTable, copyTradeLinksTable } from "@workspace/db";
import { getRedis } from "./redis";
import { getCopyTradeQueue } from "./copy-trade-queue";
import { writeAuditLog } from "./audit";
import { logger } from "./logger";

const CHECK_INTERVAL_MS = 10_000;
const DISCONNECT_THRESHOLD_MS = 60_000;

const HEARTBEAT_KEY = (metaApiId: string) => `watchdog:heartbeat:${metaApiId}`;
const ABSENT_SINCE_KEY = (metaApiId: string) => `watchdog:absent_since:${metaApiId}`;
const EMERGENCY_KEY = "watchdog:emergency:paused";

/** Called by master-poller after every successful position fetch. */
export async function updateMasterHeartbeat(metaApiId: string): Promise<void> {
  const redis = getRedis();
  // TTL = 2× the poll interval so a single missed poll doesn't trigger the alarm
  await redis.set(HEARTBEAT_KEY(metaApiId), Date.now().toString(), "EX", 30);
}

async function getActiveMasterMetaApiIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ metaApiId: slaveAccountsTable.metaApiAccountId })
    .from(copyTradeLinksTable)
    .innerJoin(
      slaveAccountsTable,
      and(
        eq(copyTradeLinksTable.masterAccountId, slaveAccountsTable.id),
        isNotNull(slaveAccountsTable.metaApiAccountId)
      )
    )
    .where(eq(copyTradeLinksTable.isActive, true));

  return rows.map((r) => r.metaApiId!).filter(Boolean);
}

async function runWatchdogCycle(): Promise<void> {
  const redis = getRedis();
  const queue = getCopyTradeQueue();

  const masterIds = await getActiveMasterMetaApiIds();
  if (masterIds.length === 0) return;

  const now = Date.now();
  let anyDisconnected = false;

  for (const metaApiId of masterIds) {
    const heartbeat = await redis.get(HEARTBEAT_KEY(metaApiId));

    if (heartbeat !== null) {
      // Master is alive — clear any absent-since tracking
      await redis.del(ABSENT_SINCE_KEY(metaApiId));
      continue;
    }

    // No heartbeat — record first-absent time if not already tracked
    const absentSinceRaw = await redis.get(ABSENT_SINCE_KEY(metaApiId));
    if (absentSinceRaw === null) {
      await redis.set(ABSENT_SINCE_KEY(metaApiId), now.toString(), "EX", 300);
      logger.warn({ metaApiId }, "Watchdog: master heartbeat missed — starting absence timer");
      continue;
    }

    const absentSince = parseInt(absentSinceRaw, 10);
    const disconnectedMs = now - absentSince;

    if (disconnectedMs >= DISCONNECT_THRESHOLD_MS) {
      anyDisconnected = true;
      logger.error(
        { metaApiId, disconnectedMs },
        "Watchdog: master disconnected for >60s"
      );
    }
  }

  const emergencyActive = await redis.get(EMERGENCY_KEY);

  if (anyDisconnected && !emergencyActive) {
    // Trigger emergency — pause queue
    await redis.set(EMERGENCY_KEY, "1", "EX", 3600); // auto-expires after 1h
    await queue.pause();

    logger.error("Watchdog: EMERGENCY — queue paused due to master disconnection");
    await writeAuditLog(
      "EMERGENCY_PAUSE",
      { masterIds, disconnectThresholdMs: DISCONNECT_THRESHOLD_MS },
      "ERROR"
    );
  } else if (!anyDisconnected && emergencyActive) {
    // All masters recovered — resume queue
    await redis.del(EMERGENCY_KEY);
    await queue.resume();

    logger.info("Watchdog: all masters recovered — queue resumed");
    await writeAuditLog("EMERGENCY_RESOLVED", { masterIds }, "INFO");
  }
}

export function startConnectionWatchdog(): void {
  if (!process.env.METAAPI_TOKEN) {
    logger.warn("METAAPI_TOKEN not set — connection watchdog will not start");
    return;
  }

  const tick = async () => {
    try {
      await runWatchdogCycle();
    } catch (err) {
      logger.error({ err }, "Watchdog: cycle error");
    }
  };

  tick();
  setInterval(tick, CHECK_INTERVAL_MS);
  logger.info({ intervalMs: CHECK_INTERVAL_MS, thresholdMs: DISCONNECT_THRESHOLD_MS }, "Connection watchdog started");
}
