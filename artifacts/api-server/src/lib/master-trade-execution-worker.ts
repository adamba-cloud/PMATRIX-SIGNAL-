import { Worker, type Job } from "bullmq";
import { db, masterTradeEventsTable, slaveAccountsTable, copyTradeLinksTable, copyTradeLogsTable, mt5AccountSubscriptionsTable } from "@workspace/db";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { getRedis } from "./redis";
import {
  MASTER_TRADE_EXECUTION_QUEUE,
  type MasterTradeExecutionJobData,
} from "./master-trade-execution-queue";
import { getAccountBalance, placeTrade } from "./metaapi";
import { logger } from "./logger";

const CONCURRENCY = 5;
const MIN_LOT_SIZE = 0.01;

// ── Proportional lot sizing ───────────────────────────────────────────────────
function calculateProportionalLots(
  masterLots: number,
  masterBalance: number | null,
  slaveBalance: number | null
): number {
  if (masterBalance != null && masterBalance > 0 && slaveBalance != null) {
    const raw = (slaveBalance / masterBalance) * masterLots;
    return Math.max(MIN_LOT_SIZE, parseFloat(raw.toFixed(2)));
  }
  return Math.max(MIN_LOT_SIZE, parseFloat(masterLots.toFixed(2)));
}

// ── Execute one slave ─────────────────────────────────────────────────────────
async function executeOnSlave(params: {
  eventId: number;
  positionId: string;
  symbol: string;
  direction: string;
  masterLots: number;
  openPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  masterAccountId: number;
  slaveAccountId: number;
  slaveMetaApiId: string;
  masterBalance: number | null;
}): Promise<void> {
  const {
    eventId,
    positionId,
    symbol,
    direction,
    masterLots,
    openPrice,
    stopLoss,
    takeProfit,
    masterAccountId,
    slaveAccountId,
    slaveMetaApiId,
    masterBalance,
  } = params;

  // Check active MT5 subscription for this slave
  const now = new Date();
  const [activeSub] = await db
    .select({ id: mt5AccountSubscriptionsTable.id })
    .from(mt5AccountSubscriptionsTable)
    .where(
      and(
        eq(mt5AccountSubscriptionsTable.slaveAccountId, slaveAccountId),
        eq(mt5AccountSubscriptionsTable.status, "ACTIVE"),
        gt(mt5AccountSubscriptionsTable.expiryDate, now)
      )
    )
    .limit(1);

  if (!activeSub) {
    logger.warn(
      { eventId, slaveAccountId, slaveMetaApiId, symbol },
      "[MasterTradeExecution] Slave skipped — no active MT5 subscription"
    );
    await db.insert(copyTradeLogsTable).values({
      masterAccountId,
      slaveAccountId,
      masterTicket: positionId,
      symbol,
      direction,
      volume: String(masterLots),
      entryPrice: openPrice != null ? String(openPrice) : null,
      stopLoss: stopLoss != null ? String(stopLoss) : null,
      takeProfit: takeProfit != null ? String(takeProfit) : null,
      masterLots: String(masterLots),
      calculatedLots: String(masterLots),
      status: "SKIPPED",
      errorMessage: "No active MT5 account subscription",
    });
    return;
  }

  // Fetch slave balance for proportional sizing
  let slaveBalance: number | null = null;
  try {
    slaveBalance = await getAccountBalance(slaveMetaApiId);
  } catch (err) {
    logger.warn(
      { err, slaveMetaApiId, symbol },
      "[MasterTradeExecution] Failed to fetch slave balance — using masterLots as-is"
    );
  }

  const calculatedLots = calculateProportionalLots(masterLots, masterBalance, slaveBalance);

  logger.info(
    {
      eventId,
      slaveMetaApiId,
      slaveAccountId,
      symbol,
      direction,
      masterLots,
      calculatedLots,
      masterBalance,
      slaveBalance,
    },
    "[MasterTradeExecution] Proportional sizing applied"
  );

  // Insert copy trade log (PENDING)
  const [log] = await db
    .insert(copyTradeLogsTable)
    .values({
      masterAccountId,
      slaveAccountId,
      masterTicket: positionId,
      symbol,
      direction,
      volume: String(calculatedLots),
      entryPrice: openPrice != null ? String(openPrice) : null,
      stopLoss: stopLoss != null ? String(stopLoss) : null,
      takeProfit: takeProfit != null ? String(takeProfit) : null,
      masterBalance: masterBalance != null ? String(masterBalance) : null,
      slaveBalance: slaveBalance != null ? String(slaveBalance) : null,
      masterLots: String(masterLots),
      calculatedLots: String(calculatedLots),
      status: "PENDING",
    })
    .returning({ id: copyTradeLogsTable.id });

  // Place trade on slave
  try {
    const result = await placeTrade(slaveMetaApiId, {
      actionType: direction === "BUY" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL",
      symbol,
      volume: calculatedLots,
      stopLoss: stopLoss ?? undefined,
      takeProfit: takeProfit ?? undefined,
      comment: `MTE:${positionId}`,
    });

    const success = result.stringCode === "TRADE_RETCODE_DONE" || result.numericCode === 10009;
    if (!success) {
      throw new Error(`Trade rejected: ${result.stringCode} — ${result.message}`);
    }

    await db
      .update(copyTradeLogsTable)
      .set({
        status: "SUCCESS",
        slaveTicket: result.orderId ?? null,
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(copyTradeLogsTable.id, log.id));

    logger.info(
      {
        logId: log.id,
        slaveMetaApiId,
        slaveAccountId,
        slaveTicket: result.orderId,
        symbol,
        direction,
        calculatedLots,
        masterLots,
        masterBalance,
        slaveBalance,
      },
      "[MasterTradeExecution] Trade executed successfully on slave"
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    await db
      .update(copyTradeLogsTable)
      .set({
        status: "FAILED",
        errorMessage,
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(copyTradeLogsTable.id, log.id));

    logger.error(
      { err, logId: log.id, slaveMetaApiId, slaveAccountId, symbol },
      "[MasterTradeExecution] Trade execution failed on slave"
    );

    throw err; // bubble so Promise.allSettled captures rejection
  }
}

// ── Fan-out to all active slaves ──────────────────────────────────────────────
async function fanOutToSlaves(
  data: MasterTradeExecutionJobData
): Promise<void> {
  const {
    eventId,
    metaApiAccountId,
    positionId,
    symbol,
    direction,
    volume,
    openPrice,
    stopLoss,
    takeProfit,
  } = data;

  const masterLots = volume ?? MIN_LOT_SIZE;

  // 1. Resolve master account DB row
  const [masterAccount] = await db
    .select({ id: slaveAccountsTable.id })
    .from(slaveAccountsTable)
    .where(eq(slaveAccountsTable.metaApiAccountId, metaApiAccountId))
    .limit(1);

  if (!masterAccount) {
    logger.warn(
      { eventId, metaApiAccountId },
      "[MasterTradeExecution] Master account not found in slave_accounts — no slave fan-out"
    );
    return;
  }

  // 2. Find all active, connected slaves linked to this master
  const links = await db
    .select({
      slaveAccountId: copyTradeLinksTable.slaveAccountId,
      slaveMetaApiId: slaveAccountsTable.metaApiAccountId,
    })
    .from(copyTradeLinksTable)
    .innerJoin(
      slaveAccountsTable,
      and(
        eq(copyTradeLinksTable.slaveAccountId, slaveAccountsTable.id),
        eq(slaveAccountsTable.status, "CONNECTED"),
        isNotNull(slaveAccountsTable.metaApiAccountId)
      )
    )
    .where(
      and(
        eq(copyTradeLinksTable.masterAccountId, masterAccount.id),
        eq(copyTradeLinksTable.isActive, true)
      )
    );

  if (links.length === 0) {
    logger.info(
      { eventId, masterAccountId: masterAccount.id, symbol },
      "[MasterTradeExecution] No active connected slave links — nothing to execute"
    );
    return;
  }

  logger.info(
    { eventId, masterAccountId: masterAccount.id, slaveCount: links.length, symbol, direction },
    "[MasterTradeExecution] Fanning out to slaves"
  );

  // 3. Fetch master balance once; used for proportional sizing across all slaves
  let masterBalance: number | null = null;
  try {
    masterBalance = await getAccountBalance(metaApiAccountId);
    logger.info(
      { eventId, metaApiAccountId, masterBalance },
      "[MasterTradeExecution] Master balance fetched"
    );
  } catch (err) {
    logger.warn(
      { err, metaApiAccountId },
      "[MasterTradeExecution] Could not fetch master balance — proportional sizing will use masterLots as-is"
    );
  }

  // 4. Execute on all slaves concurrently; capture all outcomes
  const results = await Promise.allSettled(
    links.map((link) =>
      executeOnSlave({
        eventId,
        positionId,
        symbol,
        direction,
        masterLots,
        openPrice,
        stopLoss,
        takeProfit,
        masterAccountId: masterAccount.id,
        slaveAccountId: link.slaveAccountId,
        slaveMetaApiId: link.slaveMetaApiId!,
        masterBalance,
      })
    )
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  logger.info(
    {
      eventId,
      symbol,
      direction,
      masterLots,
      masterBalance,
      totalSlaves: links.length,
      succeeded,
      failed,
    },
    "[MasterTradeExecution] Slave fan-out complete"
  );
}

// ── Worker ────────────────────────────────────────────────────────────────────
export function startMasterTradeExecutionWorker(): Worker<MasterTradeExecutionJobData> {
  const worker = new Worker<MasterTradeExecutionJobData>(
    MASTER_TRADE_EXECUTION_QUEUE,
    async (job: Job<MasterTradeExecutionJobData>) => {
      const { eventId, eventType, positionId, symbol, direction } = job.data;

      logger.info(
        { jobId: job.id, eventId, eventType, positionId, symbol, direction },
        "[MasterTradeExecution] Queue Processed"
      );

      if (eventType === "POSITION_OPENED") {
        await fanOutToSlaves(job.data);
      } else {
        // POSITION_MODIFIED and POSITION_CLOSED slave-side handling is
        // deferred — tracked by eventId for future implementation.
        logger.info(
          { jobId: job.id, eventId, eventType, positionId, symbol },
          "[MasterTradeExecution] Slave-side modify/close execution deferred — event recorded"
        );
      }

      // Mark event as fully processed
      await db
        .update(masterTradeEventsTable)
        .set({ jobStatus: "PROCESSED" })
        .where(eq(masterTradeEventsTable.id, eventId));
    },
    {
      connection: getRedis(),
      concurrency: CONCURRENCY,
      skipVersionCheck: true,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, eventId: job?.data.eventId, err: err.message },
      "[MasterTradeExecution] Job permanently failed after all retries"
    );
    if (job?.data.eventId) {
      db.update(masterTradeEventsTable)
        .set({ jobStatus: "FAILED" })
        .where(eq(masterTradeEventsTable.id, job.data.eventId))
        .catch(() => {});
    }
  });

  logger.info({ concurrency: CONCURRENCY }, "[MasterTradeExecution] Worker started");
  return worker;
}
