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
startExpiryJob();
startAdvertisementExpiryJob();
startMt5SubscriptionExpiryJob();
startMetaApiSyncJob();

// Redis-dependent services — gracefully skip if Redis is unavailable (no REDIS_URL set)
try {
  startCopyTradeWorker();
} catch (err) {
  logger.warn({ err }, "Copy trade worker not started — Redis unavailable");
}
try {
  startMasterPoller();
} catch (err) {
  logger.warn({ err }, "Master poller not started — Redis unavailable");
}
try {
  startConnectionWatchdog();
} catch (err) {
  logger.warn({ err }, "Connection watchdog not started — Redis unavailable");
}

startPaymentReconciler();
startMasterTradeListener();

server.listen(port, () => {
  logger.info({ port }, "Server listening");
  seedAdminUser();
});
