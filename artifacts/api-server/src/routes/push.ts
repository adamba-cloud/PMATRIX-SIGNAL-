import { Router } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { getVapidPublicKey, sendPush, broadcastPush } from "../lib/push";
import { logger } from "../lib/logger";

const router = Router();

router.get("/push/vapid-public-key", (_req, res): void => {
  res.json({ publicKey: getVapidPublicKey() });
});

router.post("/push/subscribe", requireAuth, async (req, res): Promise<void> => {
  const { endpoint, keys } = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "endpoint and keys (p256dh, auth) are required" });
    return;
  }

  await db
    .insert(pushSubscriptionsTable)
    .values({
      userId: req.userId!,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: {
        p256dh: keys.p256dh,
        auth: keys.auth,
        userId: req.userId!,
      },
    });

  res.json({ ok: true });
});

router.delete("/push/unsubscribe", requireAuth, async (req, res): Promise<void> => {
  const { endpoint } = req.body as { endpoint?: string };

  if (!endpoint) {
    res.status(400).json({ error: "endpoint is required" });
    return;
  }

  await db
    .delete(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, endpoint));

  res.json({ ok: true });
});

/**
 * POST /api/test-push
 * Admin-only. Sends a test push notification.
 * - If ?userId=<id> is provided, sends only to that user's subscriptions.
 * - Otherwise broadcasts to ALL subscriptions (up to 500).
 */
router.post("/test-push", requireAdmin, async (req, res): Promise<void> => {
  const { title, body, url } = req.body as {
    title?: string;
    body?: string;
    url?: string;
  };

  const payload = {
    title: title ?? "PESAMATRIX — Test Notification",
    body: body ?? "Push notifications are working correctly ✓",
    url: url ?? "/signals",
  };

  const targetUserId = req.query["userId"] ? Number(req.query["userId"]) : null;

  let subs: Array<{ id: number; endpoint: string; p256dh: string; auth: string }>;

  if (targetUserId) {
    subs = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.userId, targetUserId))
      .limit(100);
  } else {
    subs = await db
      .select()
      .from(pushSubscriptionsTable)
      .limit(500);
  }

  if (subs.length === 0) {
    logger.info({ targetUserId }, "[TestPush] No subscriptions found — nothing sent");
    res.json({ ok: true, sent: 0, failed: 0, staleRemoved: 0, message: "No push subscriptions found." });
    return;
  }

  logger.info(
    { count: subs.length, targetUserId, payload },
    "[TestPush] Sending test notification"
  );

  const { sent, failed, staleIds } = await broadcastPush(subs, payload);

  // Prune stale endpoints
  if (staleIds.length > 0) {
    const { inArray } = await import("drizzle-orm");
    await db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.id, staleIds));
    logger.info({ staleIds }, "[TestPush] Pruned stale subscriptions");
  }

  logger.info(
    { sent, failed, staleRemoved: staleIds.length },
    "[TestPush] Test notification complete"
  );

  res.json({
    ok: true,
    sent,
    failed,
    staleRemoved: staleIds.length,
    total: subs.length,
    payload,
  });
});

/**
 * GET /api/push/subscriptions/count
 * Admin-only. Returns how many push subscriptions are stored.
 */
router.get("/push/subscriptions/count", requireAdmin, async (_req, res): Promise<void> => {
  const { count } = await import("drizzle-orm");
  const [row] = await db.select({ count: count() }).from(pushSubscriptionsTable);
  res.json({ count: row?.count ?? 0 });
});

export default router;
