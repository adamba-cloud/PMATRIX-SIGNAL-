import { Router } from "express";
import { Queue } from "bullmq";
import { requireAdmin } from "../lib/auth";
import { getRedis, isRedisAvailable } from "../lib/redis";
import { COPY_TRADE_QUEUE } from "../lib/copy-trade-queue";
import { MASTER_TRADE_EXECUTION_QUEUE } from "../lib/master-trade-execution-queue";

const router = Router();

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

router.get("/admin/queue-monitor", requireAdmin, async (_req, res): Promise<void> => {
  const checkedAt = new Date().toISOString();

  // ── Redis health ──────────────────────────────────────────────────────────
  let redisStatus: "ok" | "error" | "not_configured" = "not_configured";
  let redisLatencyMs: number | null = null;
  let redisUrl = (process.env.REDIS_URL ?? "redis://localhost:6379").replace(/:\/\/([^@]+)@/, "://<credentials>@");

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

        // Fetch up to 10 most recent failed jobs
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
        queues.push({
          name,
          label,
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: 0,
        });
      }
    }
  } else {
    for (const { name, label } of QUEUE_DEFS) {
      queues.push({ name, label, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 });
    }
  }

  // Sort failed jobs newest first
  recentFailed.sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0));

  res.json({
    checkedAt,
    redis: { status: redisStatus, latencyMs: redisLatencyMs, url: redisUrl },
    queues,
    recentFailed: recentFailed.slice(0, 20),
  });
});

export default router;
