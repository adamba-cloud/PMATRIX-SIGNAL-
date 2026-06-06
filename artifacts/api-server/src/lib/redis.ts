import Redis, { type RedisOptions } from "ioredis";
import { logger } from "./logger";

let _redis: Redis | null = null;
let _unavailable = false;
let _ready = false;
const _readyResolvers: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];

/**
 * Resolve Redis connection options from environment variables.
 *
 * Priority:
 *  1. REDIS_URL  — full connection string (overrides all below)
 *  2. REDIS_HOST + REDIS_PORT + REDIS_USERNAME + REDIS_PASSWORD + REDIS_TLS
 *  3. localhost:6379 (dev fallback)
 *
 * Credentials are never logged — only the host/port are shown.
 */
function resolveRedisConfig(): {
  url?: string;
  options: RedisOptions;
  displayUrl: string;
  isExternal: boolean;
} {
  const url = process.env.REDIS_URL;
  if (url) {
    const displayUrl = url.replace(/:\/\/([^@]+)@/, "://<credentials>@");
    const isExternal = !url.includes("localhost") && !url.includes("127.0.0.1");
    const tls = url.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined;
    return {
      url,
      options: { ...(tls ? { tls } : {}), maxRetriesPerRequest: null },
      displayUrl,
      isExternal,
    };
  }

  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined;
  const username = process.env.REDIS_USERNAME ?? "default";
  const password = process.env.REDIS_PASSWORD;
  const useTls = process.env.REDIS_TLS === "true";

  if (host && password) {
    const displayUrl = `${useTls ? "rediss" : "redis"}://${username}@${host}:${port ?? 6379}`;
    return {
      options: {
        host,
        port: port ?? 6379,
        username,
        password,
        ...(useTls ? { tls: { rejectUnauthorized: false } } : {}),
        maxRetriesPerRequest: null,
      },
      displayUrl,
      isExternal: true,
    };
  }

  // Dev fallback — local Redis
  return {
    options: { host: "localhost", port: 6379, maxRetriesPerRequest: null },
    displayUrl: "redis://localhost:6379",
    isExternal: false,
  };
}

function makeRetryStrategy() {
  return (times: number): number | null => {
    if (times > 10) {
      _unavailable = true;
      logger.error(
        { attempts: times },
        "Redis: gave up after 10 retries — Redis-dependent features disabled."
      );
      for (const { reject } of _readyResolvers.splice(0)) {
        reject(new Error("Redis unavailable after max retries"));
      }
      return null;
    }
    const delay = Math.min(times * 500, 3_000);
    logger.warn({ attempt: times, retryInMs: delay }, "Redis: connection lost — will retry");
    return delay;
  };
}

export function getRedis(): Redis {
  if (_unavailable) {
    throw new Error(
      "Redis is not available. Set REDIS_HOST + REDIS_PASSWORD (or REDIS_URL) to connect to an external instance."
    );
  }

  if (!_redis) {
    const redisConfig = resolveRedisConfig();
    const { options, displayUrl, isExternal, url } = redisConfig;

    if (!isExternal) {
      logger.warn(
        { url: displayUrl },
        "Redis: connecting to localhost — set REDIS_HOST + REDIS_PASSWORD for a reliable external instance"
      );
    } else {
      logger.info({ url: displayUrl }, "Redis: connecting to external instance ✓");
    }

    logger.info({ redisUrl: displayUrl }, "Redis: REDIS_URL resolved");

    const sharedOptions: RedisOptions = {
      ...options,
      retryStrategy: makeRetryStrategy(),
    };

    // When REDIS_URL is set, pass it as the first argument so ioredis parses
    // the host/port/auth from the connection string rather than defaulting to localhost.
    _redis = url ? new Redis(url, sharedOptions) : new Redis(sharedOptions);

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

/**
 * Opens a fresh one-shot Redis connection just to ping — completely
 * independent of the singleton and the _unavailable flag.  Use this
 * for health checks so the page always reflects the real server state.
 *
 * Returns { ok: true, latencyMs } on success or { ok: false, error } on failure.
 */
export async function checkRedisDirect(): Promise<
  { ok: true; latencyMs: number } | { ok: false; error: string }
> {
  const { url, options } = resolveRedisConfig();

  const clientOptions: RedisOptions = {
    ...options,
    lazyConnect: true,
    connectTimeout: 5_000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    enableOfflineQueue: false,
  };

  const client = url ? new Redis(url, clientOptions) : new Redis(clientOptions);
  client.on("error", () => {});

  const t0 = Date.now();
  try {
    await client.connect();
    await client.ping();
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "ping failed" };
  } finally {
    client.disconnect();
  }
}
