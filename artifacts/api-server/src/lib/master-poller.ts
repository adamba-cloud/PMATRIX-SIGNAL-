import { and, eq, isNotNull } from "drizzle-orm";
import {
  db,
  slaveAccountsTable,
  copyTradeLinksTable,
  copyTradeLogsTable,
} from "@workspace/db";
import { getRedis } from "./redis";
import { getCopyTradeQueue } from "./copy-trade-queue";
import { getAccountPositions, type MetaApiPosition } from "./metaapi";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 5_000;
const POSITION_KEY = (metaApiId: string) => `master:positions:${metaApiId}`;

function positionDirection(type: MetaApiPosition["type"]): "BUY" | "SELL" {
  return type === "POSITION_TYPE_BUY" ? "BUY" : "SELL";
}

async function pollMaster(master: {
  id: number;
  metaApiId: string;
  slaves: Array<{
    linkId: number;
    accountId: number;
    metaApiId: string;
    volumeMultiplier: number;
    userId: number;
  }>;
}): Promise<void> {
  const redis = getRedis();
  const queue = getCopyTradeQueue();
  const posKey = POSITION_KEY(master.metaApiId);

  let positions: MetaApiPosition[];
  try {
    positions = await getAccountPositions(master.metaApiId);
  } catch (err) {
    logger.warn({ err, masterMetaApiId: master.metaApiId }, "Master poller: failed to fetch positions");
    return;
  }

  const currentIds = new Set(positions.map((p) => p.id));

  // Load last known position IDs from Redis
  const stored = await redis.smembers(posKey);
  const knownIds = new Set(stored);

  // Detect new positions (opened since last poll)
  const newPositions = positions.filter((p) => !knownIds.has(p.id));

  // Update Redis with current position set
  if (currentIds.size > 0) {
    await redis.del(posKey);
    await redis.sadd(posKey, ...Array.from(currentIds));
  } else {
    await redis.del(posKey);
  }

  if (newPositions.length === 0) return;

  logger.info(
    { masterAccountId: master.id, newCount: newPositions.length },
    "Master poller: new positions detected"
  );

  // Fan out to all active slaves using Promise.allSettled (one failure ≠ stop others)
  await Promise.allSettled(
    newPositions.flatMap((position) =>
      master.slaves.map(async (slave) => {
        try {
          const direction = positionDirection(position.type);
          const volume = parseFloat(
            (position.volume * slave.volumeMultiplier).toFixed(2)
          );

          // Create audit log entry (PENDING)
          const [log] = await db
            .insert(copyTradeLogsTable)
            .values({
              masterAccountId: master.id,
              slaveAccountId: slave.accountId,
              masterTicket: position.id,
              symbol: position.symbol,
              direction,
              volume: String(volume),
              entryPrice: String(position.openPrice),
              stopLoss: position.stopLoss != null ? String(position.stopLoss) : null,
              takeProfit: position.takeProfit != null ? String(position.takeProfit) : null,
              status: "PENDING",
            })
            .returning();

          // Queue the copy job
          const job = await queue.add(
            `copy:${position.id}:${slave.accountId}`,
            {
              logId: log.id,
              masterAccountId: master.id,
              slaveAccountId: slave.accountId,
              slaveMetaApiId: slave.metaApiId,
              trade: {
                ticket: position.id,
                symbol: position.symbol,
                direction,
                volume,
                openPrice: position.openPrice,
                stopLoss: position.stopLoss ?? null,
                takeProfit: position.takeProfit ?? null,
              },
            }
          );

          // Save BullMQ job ID back into the log row
          await db
            .update(copyTradeLogsTable)
            .set({ jobId: job.id ?? null, updatedAt: new Date() })
            .where(eq(copyTradeLogsTable.id, log.id));

          logger.info(
            { logId: log.id, jobId: job.id, slave: slave.accountId },
            "Master poller: copy job queued"
          );
        } catch (err) {
          logger.error(
            { err, masterAccountId: master.id, slaveAccountId: slave.accountId, ticket: position.id },
            "Master poller: failed to queue copy job for slave — continuing remaining accounts"
          );
        }
      })
    )
  );
}

async function runPollCycle(): Promise<void> {
  if (!process.env.METAAPI_TOKEN) return;

  // Fetch all active copy links with connected master accounts
  const links = await db
    .select({
      linkId: copyTradeLinksTable.id,
      masterAccountId: copyTradeLinksTable.masterAccountId,
      masterMetaApiId: slaveAccountsTable.metaApiAccountId,
      slaveAccountId: copyTradeLinksTable.slaveAccountId,
      volumeMultiplier: copyTradeLinksTable.volumeMultiplier,
      userId: copyTradeLinksTable.userId,
    })
    .from(copyTradeLinksTable)
    .innerJoin(
      slaveAccountsTable,
      and(
        eq(copyTradeLinksTable.masterAccountId, slaveAccountsTable.id),
        eq(slaveAccountsTable.status, "CONNECTED"),
        isNotNull(slaveAccountsTable.metaApiAccountId)
      )
    )
    .where(eq(copyTradeLinksTable.isActive, true));

  if (links.length === 0) return;

  // Fetch slave MetaApi IDs separately
  const slaveIds = [...new Set(links.map((l) => l.slaveAccountId))];
  const slaveAccounts = await db
    .select({ id: slaveAccountsTable.id, metaApiAccountId: slaveAccountsTable.metaApiAccountId })
    .from(slaveAccountsTable)
    .where(
      and(
        eq(slaveAccountsTable.status, "CONNECTED"),
        isNotNull(slaveAccountsTable.metaApiAccountId)
      )
    );

  const slaveMetaApiMap = new Map(
    slaveAccounts.map((s) => [s.id, s.metaApiAccountId!])
  );

  // Group links by master account
  const masterMap = new Map<
    number,
    {
      id: number;
      metaApiId: string;
      slaves: Array<{
        linkId: number;
        accountId: number;
        metaApiId: string;
        volumeMultiplier: number;
        userId: number;
      }>;
    }
  >();

  for (const link of links) {
    if (!link.masterMetaApiId) continue;
    const slaveMetaApi = slaveMetaApiMap.get(link.slaveAccountId);
    if (!slaveMetaApi) continue; // slave not connected, skip

    if (!masterMap.has(link.masterAccountId)) {
      masterMap.set(link.masterAccountId, {
        id: link.masterAccountId,
        metaApiId: link.masterMetaApiId,
        slaves: [],
      });
    }

    masterMap.get(link.masterAccountId)!.slaves.push({
      linkId: link.linkId,
      accountId: link.slaveAccountId,
      metaApiId: slaveMetaApi,
      volumeMultiplier: parseFloat(link.volumeMultiplier ?? "1"),
      userId: link.userId,
    });
  }

  // Poll all masters concurrently — failures are isolated per master
  await Promise.allSettled(
    Array.from(masterMap.values()).map((master) =>
      pollMaster(master).catch((err) =>
        logger.error({ err, masterAccountId: master.id }, "Master poller: unhandled error")
      )
    )
  );
}

export function startMasterPoller(): void {
  if (!process.env.METAAPI_TOKEN) {
    logger.warn("METAAPI_TOKEN not set — master poller will not start");
    return;
  }

  const tick = async () => {
    try {
      await runPollCycle();
    } catch (err) {
      logger.error({ err }, "Master poller: poll cycle error");
    }
  };

  tick();
  setInterval(tick, POLL_INTERVAL_MS);
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Master poller started");
}
