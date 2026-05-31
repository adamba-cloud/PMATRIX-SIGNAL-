import Redis from "ioredis";
import { logger } from "./logger";

let _redis: Redis | null = null;
let _unavailable = false;

export function getRedis(): Redis {
  if (_unavailable) {
    throw new Error("Redis is not available in this environment. Set the REDIS_URL environment variable to connect to an external Redis instance.");
  }
  if (!_redis) {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    _redis = new Redis(url, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        if (times > 3) {
          _unavailable = true;
          logger.warn("Redis unavailable after retries — Redis-dependent features (copy trading, spread guard) are disabled. Set REDIS_URL to enable them.");
          return null;
        }
        return Math.min(times * 500, 2000);
      },
    });
    _redis.on("error", (err) => {
      if (!_unavailable) logger.warn({ err }, "Redis error");
    });
    _redis.on("connect", () => logger.info("Redis connected"));
  }
  return _redis;
}

export function isRedisAvailable(): boolean {
  return !_unavailable && _redis !== null;
}
