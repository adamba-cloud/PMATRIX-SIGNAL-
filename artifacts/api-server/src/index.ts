import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { attachForexWebSocket } from "./lib/forex-ws";
import { startExpiryJob } from "./lib/expiry-job";
import { startMetaApiSyncJob } from "./lib/metaapi-sync-job";
import { startCopyTradeWorker } from "./lib/copy-trade-worker";
import { startConnectionWatchdog } from "./lib/connection-watchdog";
import { startPaymentReconciler } from "./lib/payment-reconciler";
import { seedAdminUser } from "./lib/seed";
import { startAdvertisementExpiryJob } from "./lib/advertisement-expiry-job";
import { startMt5SubscriptionExpiryJob } from "./lib/mt5-subscription-expiry-job";
import { startMasterTradeListener } from "./lib/master-trade-listener";
import { startAutoRedeployWatcher } from "./lib/auto-redeploy-watcher";
import { waitForRedis } from "./lib/redis";

// ── Startup banner ────────────────────────────────────────────────────────────
const env = process.env.NODE_ENV ?? "development";
logger.info(
  {
    env,
    node: process.version,
    db: process.env.DATABASE_URL ? "configured" : "MISSING",
    redis: process.env.REDIS_URL
      ? "external (REDIS_URL)"
      : process.env.REDIS_HOST
      ? "external (REDIS_HOST)"
      : "local fallback",
  },
  "PESAMATRIX API starting up"
);

// ── Port validation ───────────────────────────────────────────────────────────
const rawPort = process.env["PORT"];

if (!rawPort) {
  logger.error("PORT environment variable is required but was not provided.");
  process.exit(1);
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  logger.error({ rawPort }, "Invalid PORT value");
  process.exit(1);
}

// ── Unhandled rejection / exception guards ────────────────────────────────────
// Log unhandled promise rejections but keep running — most are non-fatal
// background job failures (e.g. a BullMQ job that throws).
process.on("unhandledRejection", (reason) => {
  logger.error({ reason: String(reason) }, "Unhandled promise rejection — continuing");
});

// Exit on uncaught exceptions — these are always programming errors that
// leave the process in an undefined state. Let the process manager restart.
process.on("uncaughtException", (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, "Uncaught exception — exiting");
  process.exit(1);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Render sends SIGTERM before stopping the container. We finish in-flight
// requests and close the server cleanly instead of hard-killing mid-request.
function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Shutdown signal received — closing server gracefully");
  server.close(() => {
    logger.info("HTTP server closed — process exiting");
    process.exit(0);
  });
  // Force exit after 15 s if connections don't drain
  setTimeout(() => {
    logger.warn("Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 15_000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = createServer(app);
attachForexWebSocket(server);

// ── Essential services — start before accepting traffic ───────────────────────
// These are lightweight interval jobs that don't block startup.
startExpiryJob();
startAdvertisementExpiryJob();
startMt5SubscriptionExpiryJob();

// ── Redis-dependent services — wait until Redis is ready ─────────────────────
async function startRedisServices(): Promise<void> {
  logger.info("Redis: waiting for ready signal before initialising queues and workers…");

  try {
    await waitForRedis(15_000);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Redis: not ready — copy-trading queue and connection watchdog will NOT start. " +
        "Set REDIS_URL to connect to an external Redis instance."
    );
    return;
  }

  logger.info("Redis: connection confirmed — initialising Redis-dependent services");

  try {
    startCopyTradeWorker();
    logger.info("Queue: copy-trade worker initialised ✓");
  } catch (err) {
    logger.warn({ err }, "Queue: copy-trade worker failed to start");
  }

  logger.info("Queue: master poller DISABLED — CopyFactory handles trade replication");

  try {
    startConnectionWatchdog();
    logger.info("Queue: connection watchdog initialised ✓");
  } catch (err) {
    logger.warn({ err }, "Queue: connection watchdog failed to start");
  }

  logger.info("Queue: master-trade execution worker DISABLED — CopyFactory handles trade replication");
  logger.info("Redis: all queue workers running ✓");
}

// ── Non-essential services — lazy-start after server is up ───────────────────
// Delay these so the server passes Render's health check (GET /api/health)
// before doing any heavy external calls (MetaApi, payment reconciler, etc.).
function startDeferredServices(delayMs = 5_000): void {
  setTimeout(() => {
    logger.info({ delayMs }, "Deferred services: starting after initial delay");

    try {
      startMetaApiSyncJob();
    } catch (err) {
      logger.warn({ err }, "Deferred: MetaApi sync job failed to start");
    }

    try {
      startPaymentReconciler();
    } catch (err) {
      logger.warn({ err }, "Deferred: payment reconciler failed to start");
    }

    try {
      startMasterTradeListener();
    } catch (err) {
      logger.warn({ err }, "Deferred: master trade listener failed to start");
    }

    try {
      startAutoRedeployWatcher();
    } catch (err) {
      logger.warn({ err }, "Deferred: auto-redeploy watcher failed to start");
    }

    logger.info("Deferred services: all started ✓");
  }, delayMs);
}

// ── Start listening ───────────────────────────────────────────────────────────
server.listen(port, () => {
  logger.info({ port, env }, "✓ Server listening — ready to accept requests");

  // Seed the admin user (idempotent — safe to run every boot)
  seedAdminUser().catch((err) =>
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Seed: admin user seed failed")
  );

  // Start Redis-dependent services (fire-and-forget, waits for Redis ready)
  startRedisServices().catch((err) =>
    logger.error({ err }, "startRedisServices: unexpected error")
  );

  // Start external-API services 5 s after boot so health checks pass first
  startDeferredServices(5_000);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    logger.error({ port }, "Port already in use — is another instance running?");
  } else {
    logger.error({ err: err.message }, "HTTP server error");
  }
  process.exit(1);
});
