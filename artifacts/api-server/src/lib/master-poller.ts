import { and, eq, isNotNull } from "drizzle-orm";
import {
  db,
  slaveAccountsTable,
  copyTradeLogsTable,
  systemConfigTable,
} from "@workspace/db";
import { getRedis } from "./redis";
import { getCopyTradeQueue } from "./copy-trade-queue";
import { getAccountPositions, getAccountBalance, type MetaApiPosition } from "./metaapi";
import { updateMasterHeartbeat } from "./connection-watchdog";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 5_000;
const POSITION_KEY = (metaApiId: string) => `master:positions:${metaApiId}`;
const MIN_LOT_SIZE = 0.01;

function positionDirection(type: MetaApiPosition["type"]): "BUY" | "SELL" {
  return type === "POSITION_TYPE_BUY" ? "BUY" : "SELL";
}

function applyLotProtection(raw: number): number {
  return Math.max(MIN_LOT_SIZE, parseFloat(raw.toFixed(2)));
}

async function calculateVolume(
  masterLots: number,
  slave: {
    lotSizeType: "FIXED" | "PROPORTIONAL";
    volumeMultiplier: number;
    metaApiId: string;
  },
  masterMetaApiId: string
): Promise<{
  volume: number;
  masterBalance: number | null;
  slaveBalance: number | null;
}> {
  if (slave.lotSizeType === "PROPORTIONAL") {
    try {
      const [masterBalance, slaveBalance] = await Promise.all([
        getAccountBalance(masterMetaApiId),
        getAccountBalance(slave.metaApiId),
      ]);

      if (masterBalance != null && masterBalance > 0 && slaveBalance != null) {
        const riskMultiplier = slaveBalance / masterBalance;
        const volume = applyLotProtection(masterLots * riskMultiplier);
        return { volume, masterBalance, slaveBalance };
      }

      logger.warn(
        { masterMetaApiId, slaveMetaApiId: slave.metaApiId, masterBalance, slaveBalance },
        "Master poller: balance unavailable for PROPORTIONAL — falling back to FIXED"
      );
      return {
        volume: applyLotProtection(masterLots * slave.volumeMultiplier),
        masterBalance,
        slaveBalance,
      };
    } catch (err) {
      logger.warn(
        { err, masterMetaApiId, slaveMetaApiId: slave.metaApiId },
        "Master poller: failed to fetch balances for PROPORTIONAL — falling back to FIXED"
      );
      return {
        volume: applyLotProtection(masterLots * slave.volumeMultiplier),
        masterBalance: null,
        slaveBalance: null,
      };
    }
  }

  return {
    volume: applyLotProtection(masterLots * slave.volumeMultiplier),
    masterBalance: null,
    slaveBalance: null,
  };
}

async function pollMaster(master: {
  id: number;
  metaApiId: string;
  slaves: Array<{
    linkId: number;
    accountId: number;
    metaApiId: string;
    volumeMultiplier: number;
    lotSizeType: "FIXED" | "PROPORTIONAL";
    userId: number;
  }>;
}): Promise<void> {
  const redis = getRedis();
  const queue = getCopyTradeQueue();
  const posKey = POSITION_KEY(master.metaApiId);

  let positions: MetaApiPosition[];
  try {
    positions = await getAccountPositions(master.metaApiId);
    await updateMasterHeartbeat(master.metaApiId);
  } catch (err) {
    logger.warn({ err, masterMetaApiId: master.metaApiId }, "Master poller: failed to fetch positions");
    return;
  }

  const currentIds = new Set(positions.map((p) => p.id));
  const stored = await redis.smembers(posKey);
  const knownIds = new Set(stored);
  const newPositions = positions.filter((p) => !knownIds.has(p.id));

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

  await Promise.allSettled(
    newPositions.flatMap((position) =>
      master.slaves.map(async (slave) => {
        try {
          const direction = positionDirection(position.type);
          const masterLots = position.volume;

          const { volume, masterBalance, slaveBalance } = await calculateVolume(
            masterLots,
            slave,
            master.metaApiId
          );

          logger.info(
            {
              mode: slave.lotSizeType,
              masterLots,
              calculatedLots: volume,
              masterBalance,
              slaveBalance,
              slaveAccountId: slave.accountId,
            },
            "Master poller: lot size calculated"
          );

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
              masterBalance: masterBalance != null ? String(masterBalance) : null,
              slaveBalance: slaveBalance != null ? String(slaveBalance) : null,
              masterLots: String(masterLots),
              calculatedLots: String(volume),
            })
            .returning();

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

          await db
            .update(copyTradeLogsTable)
            .set({ jobId: job.id ?? null, updatedAt: new Date() })
            .where(eq(copyTradeLogsTable.id, log.id));

          logger.info(
            { logId: log.id, jobId: job.id, slaveAccountId: slave.accountId },
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

// BUG FIX: The original code queried copy_trade_links which requires the master
// account to be in slave_accounts. The master lives in system_config, so links
// were always empty and the poller silently returned every cycle.
// Fixed: read master from system_config, fan out to all connected slave_accounts
// directly. The VIRTUAL_MASTER_ID (0) is used where masterAccountId is needed;
// it will not match any real slave_accounts row (IDs are 1-based serials).
const VIRTUAL_MASTER_ID = 0;

async function runPollCycle(): Promise<void> {
  if (!process.env.METAAPI_TOKEN) return;

  // Read master MetaApi account ID from system_config
  const [masterRow] = await db
    .select({ value: systemConfigTable.value })
    .from(systemConfigTable)
    .where(eq(systemConfigTable.key, "masterMetaApiAccountId"))
    .limit(1);

  const masterMetaApiId = masterRow?.value ?? null;
  if (!masterMetaApiId) return; // no master configured yet

  // Find all connected slave accounts
  const slaveAccounts = await db
    .select({
      id: slaveAccountsTable.id,
      metaApiAccountId: slaveAccountsTable.metaApiAccountId,
      userId: slaveAccountsTable.userId,
    })
    .from(slaveAccountsTable)
    .where(
      and(
        eq(slaveAccountsTable.status, "CONNECTED"),
        isNotNull(slaveAccountsTable.metaApiAccountId)
      )
    );

  if (slaveAccounts.length === 0) return;

  const master = {
    id: VIRTUAL_MASTER_ID,
    metaApiId: masterMetaApiId,
    slaves: slaveAccounts.map((s) => ({
      linkId: s.id, // reuse account ID as linkId for logging
      accountId: s.id,
      metaApiId: s.metaApiAccountId!,
      volumeMultiplier: 1,
      lotSizeType: "FIXED" as const,
      userId: s.userId,
    })),
  };

  await pollMaster(master).catch((err) =>
    logger.error({ err, masterMetaApiId }, "Master poller: unhandled error")
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
