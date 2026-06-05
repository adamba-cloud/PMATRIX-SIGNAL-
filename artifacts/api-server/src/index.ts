import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { attachForexWebSocket } from "./lib/forex-ws";
import { startExpiryJob } from "./lib/expiry-job";
import { startMetaApiSyncJob } from "./lib/metaapi-sync-job";
import { startCopyTradeWorker } from "./lib/copy-trade-worker";
import { startMasterPoller } from "./lib/master-poller";
import { startConnectionWatchdog } from "./lib/connection-watchdog";
import { startPaymentReconciler } from "./lib/payment-reconciler";
import { seedAdminUser } from "./lib/seed";
import { startAdvertisementExpiryJob } from "./lib/advertisement-expiry-job";
import { startMt5SubscriptionExpiryJob } from "./lib/mt5-subscription-expiry-job";
import { startMasterTradeListener } from "./lib/master-trade-listener";
import { startMasterTradeExecutionWorker } from "./lib/master-trade-execution-worker";
import { waitForRedis } from "./lib/redis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
logger.info({ redisUrl: redisUrl.replace(/:\/\/([^@]+)@/, "://<credentials>@") }, "Redis: REDIS_URL resolved");

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
attachForexWebSocket(server);

// ── Non-Redis services — start immediately ────────────────────────────────────
startExpiryJob();
startAdvertisementExpiryJob();
startMt5SubscriptionExpiryJob();
startMetaApiSyncJob();
startPaymentReconciler();
startMasterTradeListener();

// ── Redis-dependent services — wait until Redis is ready ─────────────────────
//
// Root cause of the "Failed to enqueue job — Redis may be unavailable" error:
//   redis.ts previously used lazyConnect:true + enableOfflineQueue:false.
//   BullMQ fires commands the instant a Queue/Worker is constructed; with those
//   flags the commands raced the TCP handshake, failed immediately, exhausted
//   the retryStrategy ceiling (3), and set _unavailable=true permanently.
//
// Fix: redis.ts now connects eagerly (no lazyConnect) with the offline queue
// enabled, so BullMQ commands queue until the handshake completes. We also
// await Redis here before constructing any Queue or Worker so the workers are
// only registered once the connection is confirmed healthy.

async function startRedisServices(): Promise<void> {
  logger.info("Redis: waiting for ready signal before initialising queues and workers…");

  try {
    await waitForRedis(15_000);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Redis: not ready — copy-trading queue, master poller, connection watchdog, and master execution worker will NOT start. " +
      "Ensure Redis is running and set REDIS_URL if using an external instance."
    );
    return;
  }

  logger.info("Redis: connection confirmed — initialising Redis-dependent services");

  // ── Copy trade queue worker ───────────────────────────────────────────────
  // NOTE: CopyFactory (MetaApi-native) is now the primary trade-copying
  // mechanism. The legacy copy-trade-worker and master-poller are DISABLED
  // to prevent double-execution of trades on slave accounts. CopyFactory
  // subscribes each slave to the master's strategy and copies trades
  // automatically without any server-side polling.
  // The copy-trade-worker queue is still initialised so queued jobs drain.
  try {
    startCopyTradeWorker();
    logger.info("Queue: copy-trade worker initialised ✓");
  } catch (err) {
    logger.warn({ err }, "Queue: copy-trade worker failed to start");
  }

  // ── Master position poller — DISABLED (replaced by CopyFactory) ───────────
  // Keeping this disabled prevents double-execution: CopyFactory handles
  // trade replication at the MetaApi level; running the poller on top would
  // execute each trade twice on every slave account.
  logger.info("Queue: master poller DISABLED — CopyFactory handles trade replication");

  // ── Connection watchdog (kill switch) ─────────────────────────────────────
  try {
    startConnectionWatchdog();
    logger.info("Queue: connection watchdog initialised ✓");
  } catch (err) {
    logger.warn({ err }, "Queue: connection watchdog failed to start");
  }

  // ── Master trade execution worker (fan-out to slaves) ────────────────────
  // NOTE: Also disabled — CopyFactory is the primary execution path.
  // Re-enable only if you want server-side copy trading as a fallback.
  logger.info("Queue: master-trade execution worker DISABLED — CopyFactory handles trade replication");

  logger.info("Redis: all queue workers running ✓");
}

server.listen(port, () => {
  logger.info({ port }, "Server listening");
  seedAdminUser();
  // Fire-and-forget — Redis services start asynchronously after ready signal
  startRedisServices().catch((err) =>
    logger.error({ err }, "startRedisServices: unexpected error")
  );
});
