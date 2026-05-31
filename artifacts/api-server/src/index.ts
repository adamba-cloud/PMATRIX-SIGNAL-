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
startMetaApiSyncJob();
startCopyTradeWorker();
startMasterPoller();
startConnectionWatchdog();
startPaymentReconciler();

server.listen(port, () => {
  logger.info({ port }, "Server listening");
  seedAdminUser();
});
