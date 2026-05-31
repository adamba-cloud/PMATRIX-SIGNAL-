import { Worker } from "bullmq";
import { db, copyTradeLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getRedis } from "./redis";
import { COPY_TRADE_QUEUE, type CopyTradeJobData } from "./copy-trade-queue";
import { placeTrade } from "./metaapi";
import { logger } from "./logger";

const CONCURRENCY = 10;

export function startCopyTradeWorker(): Worker<CopyTradeJobData> {
  const worker = new Worker<CopyTradeJobData>(
    COPY_TRADE_QUEUE,
    async (job) => {
      const { logId, slaveMetaApiId, trade } = job.data;

      logger.info(
        { logId, slaveMetaApiId, symbol: trade.symbol, direction: trade.direction },
        "Copy trade worker: processing job"
      );

      try {
        const result = await placeTrade(slaveMetaApiId, {
          actionType: trade.direction === "BUY" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL",
          symbol: trade.symbol,
          volume: trade.volume,
          stopLoss: trade.stopLoss ?? undefined,
          takeProfit: trade.takeProfit ?? undefined,
          comment: `CopyTrade:${trade.ticket}`,
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
          .where(eq(copyTradeLogsTable.id, logId));

        logger.info(
          { logId, slaveMetaApiId, slaveTicket: result.orderId },
          "Copy trade worker: trade executed successfully"
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";

        // Log failure but don't block other accounts — BullMQ handles retries per-job
        await db
          .update(copyTradeLogsTable)
          .set({
            status: "FAILED",
            errorMessage,
            executedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(copyTradeLogsTable.id, logId));

        logger.error(
          { err, logId, slaveMetaApiId },
          "Copy trade worker: trade execution failed"
        );

        throw err; // re-throw so BullMQ retries up to job.opts.attempts
      }
    },
    {
      connection: getRedis(),
      concurrency: CONCURRENCY,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, logId: job?.data.logId, err: err.message },
      "Copy trade worker: job permanently failed after all retries"
    );
  });

  logger.info({ concurrency: CONCURRENCY }, "Copy trade worker started");
  return worker;
}
