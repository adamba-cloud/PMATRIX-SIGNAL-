import Redis from "ioredis";
import { logger } from "./logger";

let _redis: Redis | null = null;
let _unavailable = false;
let _ready = false;
const _readyResolvers: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];

export function getRedis(): Redis {
  if (_unavailable) {
    throw new Error(
      "Redis is not available in this environment. Set the REDIS_URL environment variable to connect to an external Redis instance."
    );
  }

  if (!_redis) {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    // Mask credentials in log output
    const displayUrl = url.replace(/:\/\/([^@]+)@/, "://<credentials>@");

    logger.info({ url: displayUrl }, "Redis: connecting");

    _redis = new Redis(url, {
      // Required by BullMQ
      maxRetriesPerRequest: null,

      // Do NOT use lazyConnect — BullMQ sends commands immediately on Queue/Worker
      // creation and needs the connection to be establishing before those arrive.
      //
      // Do NOT set enableOfflineQueue: false — with lazyConnect removed the default
      // (true) lets commands queue while the initial handshake completes. Without
      // this, every BullMQ command races the connect and fails → retryStrategy fires
      // → _unavailable=true before Redis even responds.

      retryStrategy: (times) => {
        if (times > 10) {
          _unavailable = true;
          logger.error(
            { attempts: times },
            "Redis: gave up after 10 retries — Redis-dependent features disabled. Set REDIS_URL to fix."
          );
          // Reject any callers waiting on waitForRedis()
          for (const { reject } of _readyResolvers.splice(0)) {
            reject(new Error("Redis unavailable after max retries"));
          }
          return null; // stop retrying
        }
        const delay = Math.min(times * 500, 3_000);
        logger.warn({ attempt: times, retryInMs: delay }, "Redis: connection lost — will retry");
        return delay;
      },
    });

    _redis.on("connect", () => {
      logger.info("Redis: TCP connection established");
    });

    _redis.on("ready", () => {
      _ready = true;
      logger.info("Redis: ready — all queued commands unblocked");
      for (const { resolve } of _readyResolvers.splice(0)) resolve();
    });

    _redis.on("error", (err: Error) => {
      if (!_unavailable) {
        logger.warn({ err: err.message }, "Redis: error");
      }
    });

    _redis.on("reconnecting", () => {
      _ready = false;
      logger.warn("Redis: reconnecting");
    });

    _redis.on("close", () => {
      _ready = false;
      logger.warn("Redis: connection closed");
    });
  }

  return _redis;
}

/**
 * Resolves once Redis emits "ready".
 * Initialises the connection if it hasn't been created yet.
 * Rejects after timeoutMs or if Redis becomes permanently unavailable.
 */
export function waitForRedis(timeoutMs = 15_000): Promise<void> {
  // Kick-start the connection (no-op if already created)
  try {
    getRedis();
  } catch (err) {
    return Promise.reject(err);
  }

  if (_ready) return Promise.resolve();
  if (_unavailable) return Promise.reject(new Error("Redis is unavailable"));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Redis did not become ready within ${timeoutMs}ms — is it running?`));
    }, timeoutMs);

    _readyResolvers.push({
      resolve: () => { clearTimeout(timer); resolve(); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
  });
}

export function isRedisAvailable(): boolean {
  return !_unavailable && _redis !== null && _ready;
}
