import { Router } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { getVapidPublicKey } from "../lib/push";

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

export default router;
