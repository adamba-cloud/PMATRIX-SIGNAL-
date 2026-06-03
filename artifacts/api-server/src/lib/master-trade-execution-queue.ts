import { Queue } from "bullmq";
import { getRedis } from "./redis";

export const MASTER_TRADE_EXECUTION_QUEUE = "master-trade-execution";

export interface MasterTradeExecutionJobData {
  eventId: number;
  eventType: "POSITION_OPENED" | "POSITION_MODIFIED" | "POSITION_CLOSED";
  metaApiAccountId: string;
  positionId: string;
  symbol: string;
  direction: string;
  volume: number | null;
  openPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  changedFields: string | null;
}

let _queue: Queue<MasterTradeExecutionJobData> | null = null;

export function getMasterTradeExecutionQueue(): Queue<MasterTradeExecutionJobData> {
  if (!_queue) {
    _queue = new Queue<MasterTradeExecutionJobData>(MASTER_TRADE_EXECUTION_QUEUE, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return _queue;
}
