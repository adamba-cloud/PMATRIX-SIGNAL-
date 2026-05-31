import Redis from "ioredis";
import { logger } from "./logger";

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    _redis = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
    _redis.on("error", (err) => logger.warn({ err }, "Redis error"));
    _redis.on("connect", () => logger.info("Redis connected"));
  }
  return _redis;
}
