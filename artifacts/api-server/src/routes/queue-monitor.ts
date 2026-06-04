import { Router } from "express";
import { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { getRedis, isRedisAvailable } from "../lib/redis";
import { getCopyTradeQueue, COPY_TRADE_QUEUE } from "../lib/copy-trade-queue";
import { MASTER_TRADE_EXECUTION_QUEUE } from "../lib/master-trade-execution-queue";
import { writeAuditLog } from "../lib/audit";
import { logger } from "../lib/logger";
import { db, usersTable } from "@workspace/db";

const router = Router();

const EMERGENCY_KEY = "watchdog:emergency:paused";
const EMERGENCY_TTL_SECONDS = 3600; // 1 hour, same as watchdog

interface QueueStats {
  name: string;
  label: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

interface FailedJob {
  queue: string;
  jobId: string | undefined;
  name: string;
  failedReason: string;
  attemptsMade: number;
  finishedOn: number | null;
}

interface KillSwitchStatus {
  active: boolean;
  activatedAt: string | null;
  ttlSeconds: number | null;
  activatedBy: string | null;
}

// ── GET /api/admin/queue-monitor ──────────────────────────────────────────────

router.get("/admin/queue-monitor", requireAdmin, async (_req, res): Promise<void> => {
  const checkedAt = new Date().toISOString();

  // ── Redis health ──────────────────────────────────────────────────────────
  let redisStatus: "ok" | "error" | "not_configured" = "not_configured";
  let redisLatencyMs: number | null = null;
  const redisUrl = (process.env.REDIS_URL ?? "redis://localhost:6379").replace(/:\/\/([^@]+)@/, "://<credentials>@");

  try {
    if (!isRedisAvailable()) {
      redisStatus = "error";
    } else {
      const redis = getRedis();
      const t0 = Date.now();
      await redis.ping();
      redisLatencyMs = Date.now() - t0;
      redisStatus = "ok";
    }
  } catch {
    redisStatus = "error";
  }

  // ── Kill switch state ─────────────────────────────────────────────────────
  const killSwitch: KillSwitchStatus = {
    active: false,
    activatedAt: null,
    ttlSeconds: null,
    activatedBy: null,
  };

  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      const [val, ttl, meta] = await Promise.all([
        redis.get(EMERGENCY_KEY),
        redis.ttl(EMERGENCY_KEY),
        redis.get(`${EMERGENCY_KEY}:meta`),
      ]);
      if (val !== null) {
        killSwitch.active = true;
        killSwitch.ttlSeconds = ttl > 0 ? ttl : null;
        if (meta) {
          try {
            const parsed = JSON.parse(meta) as { activatedAt?: string; activatedBy?: string };
            killSwitch.activatedAt = parsed.activatedAt ?? null;
            killSwitch.activatedBy = parsed.activatedBy ?? null;
          } catch {}
        }
      }
    } catch {}
  }

  // ── Queue stats ──────────────────────────────────────────────────────────
  const QUEUE_DEFS = [
    { name: COPY_TRADE_QUEUE, label: "Copy Trade" },
    { name: MASTER_TRADE_EXECUTION_QUEUE, label: "Master Trade Execution" },
  ];

  const queues: QueueStats[] = [];
  const recentFailed: FailedJob[] = [];

  if (isRedisAvailable()) {
    const redis = getRedis();

    for (const { name, label } of QUEUE_DEFS) {
      try {
        const q = new Queue(name, { connection: redis });
        const counts = await q.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused");
        queues.push({
          name,
          label,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
          paused: counts.paused ?? 0,
        });

        const failedJobs = await q.getFailed(0, 9);
        for (const job of failedJobs) {
          recentFailed.push({
            queue: label,
            jobId: job.id,
            name: job.name,
            failedReason: job.failedReason ?? "Unknown error",
            attemptsMade: job.attemptsMade,
            finishedOn: job.finishedOn ?? null,
          });
        }

        await q.close();
      } catch {
        queues.push({ name, label, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 });
      }
    }
  } else {
    for (const { name, label } of QUEUE_DEFS) {
      queues.push({ name, label, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 });
    }
  }

  recentFailed.sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0));

  res.json({
    checkedAt,
    redis: { status: redisStatus, latencyMs: redisLatencyMs, url: redisUrl },
    killSwitch,
    queues,
    recentFailed: recentFailed.slice(0, 20),
  });
});

// ── POST /api/admin/kill-switch ───────────────────────────────────────────────

router.post("/admin/kill-switch", requireAdmin, async (req, res): Promise<void> => {
  const { active, reason } = req.body as { active: boolean; reason?: string };

  // Resolve admin email from DB using the userId attached by requireAdmin middleware
  let adminEmail = "unknown";
  try {
    const userId = (req as { userId?: number }).userId;
    if (userId) {
      const [user] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
      if (user) adminEmail = user.email;
    }
  } catch {}


  if (!isRedisAvailable()) {
    res.status(503).json({ error: "Redis is not available — kill switch requires Redis" });
    return;
  }

  const redis = getRedis();
  const queue = getCopyTradeQueue();

  if (active) {
    // ── Activate kill switch ────────────────────────────────────────────────
    const meta = JSON.stringify({
      activatedAt: new Date().toISOString(),
      activatedBy: adminEmail,
      reason: reason ?? "Manual admin action",
    });

    await redis.set(EMERGENCY_KEY, "1", "EX", EMERGENCY_TTL_SECONDS);
    await redis.set(`${EMERGENCY_KEY}:meta`, meta, "EX", EMERGENCY_TTL_SECONDS + 60);
    await queue.pause();

    logger.warn(
      { activatedBy: adminEmail, reason },
      "Kill switch ACTIVATED — copy-trade queue paused by admin"
    );
    await writeAuditLog(
      "KILL_SWITCH_ACTIVATED",
      { activatedBy: adminEmail, reason: reason ?? "Manual admin action", ttlSeconds: EMERGENCY_TTL_SECONDS },
      "WARN"
    );

    res.json({ active: true, message: "Kill switch activated — copy-trade queue paused" });
  } else {
    // ── Deactivate kill switch ──────────────────────────────────────────────
    await redis.del(EMERGENCY_KEY);
    await redis.del(`${EMERGENCY_KEY}:meta`);
    await queue.resume();

    logger.info(
      { deactivatedBy: adminEmail },
      "Kill switch DEACTIVATED — copy-trade queue resumed by admin"
    );
    await writeAuditLog(
      "KILL_SWITCH_DEACTIVATED",
      { deactivatedBy: adminEmail },
      "INFO"
    );

    res.json({ active: false, message: "Kill switch deactivated — copy-trade queue resumed" });
  }
});

export default router;
