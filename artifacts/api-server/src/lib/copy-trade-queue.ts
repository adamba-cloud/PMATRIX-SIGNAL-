import { Queue } from "bullmq";
import { getRedis } from "./redis";
import { logger } from "./logger";

export const COPY_TRADE_QUEUE = "copy-trade";

export interface CopyTradeJobData {
  logId: number;
  masterAccountId: number;
  slaveAccountId: number;
  slaveMetaApiId: string;
  trade: {
    ticket: string;
    symbol: string;
    direction: "BUY" | "SELL";
    volume: number;
    openPrice: number;
    stopLoss: number | null;
    takeProfit: number | null;
  };
}

let _queue: Queue<CopyTradeJobData> | null = null;

export function getCopyTradeQueue(): Queue<CopyTradeJobData> {
  if (!_queue) {
    _queue = new Queue<CopyTradeJobData>(COPY_TRADE_QUEUE, {
      connection: getRedis(),
      skipVersionCheck: true,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      },
    });
    logger.info({ queue: COPY_TRADE_QUEUE }, "Queue: copy-trade queue initialised ✓");
  }
  return _queue;
}
