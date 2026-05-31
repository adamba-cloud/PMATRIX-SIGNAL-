import { Router } from "express";
import { db, subscriptionsTable, systemConfigTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { CreateSubscriptionBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

function formatSub(s: typeof subscriptionsTable.$inferSelect) {
  return {
    id: s.id,
    userId: s.userId,
    status: s.status,
    daysSelected: s.daysSelected,
    totalAmount: parseFloat(s.totalAmount),
    feePerDay: parseFloat(s.feePerDay),
    startDate: s.startDate?.toISOString() ?? null,
    endDate: s.endDate?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

router.get("/subscriptions/my", requireAuth, async (req, res): Promise<void> => {
  const [sub] = await db.select().from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, req.userId!))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(1);

  if (!sub) {
    res.status(200).json({
      id: 0,
      userId: req.userId!,
      status: "PENDING",
      daysSelected: 0,
      totalAmount: 0,
      feePerDay: 150,
      startDate: null,
      endDate: null,
      createdAt: new Date().toISOString(),
    });
    return;
  }

  res.json(formatSub(sub));
});

router.post("/subscriptions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [feeConfig] = await db.select().from(systemConfigTable).where(eq(systemConfigTable.key, "feePerDay"));
  const [minDaysConfig] = await db.select().from(systemConfigTable).where(eq(systemConfigTable.key, "minDays"));

  const feePerDay = feeConfig ? parseFloat(feeConfig.value) : 150;
  const minDays = minDaysConfig ? parseInt(minDaysConfig.value, 10) : 7;

  const { daysSelected } = parsed.data;
  if (daysSelected < minDays) {
    res.status(400).json({ error: `Minimum subscription is ${minDays} days` });
    return;
  }

  const totalAmount = (feePerDay * daysSelected).toFixed(2);

  const [sub] = await db.insert(subscriptionsTable).values({
    userId: req.userId!,
    status: "PENDING",
    daysSelected,
    totalAmount,
    feePerDay: feePerDay.toFixed(2),
  }).returning();

  res.status(201).json(formatSub(sub));
});

router.get("/subscriptions", requireAdmin, async (_req, res): Promise<void> => {
  const subs = await db.select().from(subscriptionsTable).orderBy(desc(subscriptionsTable.createdAt));
  res.json(subs.map(formatSub));
});

export default router;
