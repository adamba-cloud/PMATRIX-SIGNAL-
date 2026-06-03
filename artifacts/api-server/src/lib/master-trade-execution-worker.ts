import { Worker, type Job } from "bullmq";
import { db, masterTradeEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getRedis } from "./redis";
import {
  MASTER_TRADE_EXECUTION_QUEUE,
  type MasterTradeExecutionJobData,
} from "./master-trade-execution-queue";
import { logger } from "./logger";

const CONCURRENCY = 5;

export function startMasterTradeExecutionWorker(): Worker<MasterTradeExecutionJobData> {
  const worker = new Worker<MasterTradeExecutionJobData>(
    MASTER_TRADE_EXECUTION_QUEUE,
    async (job: Job<MasterTradeExecutionJobData>) => {
      const { eventId, eventType, positionId, symbol, direction, volume, changedFields } = job.data;

      logger.info(
        {
          jobId: job.id,
          eventId,
          eventType,
          positionId,
          symbol,
          direction,
          volume,
          changedFields: changedFields ?? undefined,
        },
        "[MasterTradeExecution] Queue Processed"
      );

      await db
        .update(masterTradeEventsTable)
        .set({ jobStatus: "PROCESSED" })
        .where(eq(masterTradeEventsTable.id, eventId));

      // NOTE: Slave account execution is intentionally deferred.
      // This worker acknowledges the job and marks it processed.
      // Slave-side copy execution will be wired here in a future step.
    },
    {
      connection: getRedis(),
      concurrency: CONCURRENCY,
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
