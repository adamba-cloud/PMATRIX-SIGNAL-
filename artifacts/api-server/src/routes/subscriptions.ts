import { Router } from "express";
import { db, subscriptionsTable, systemConfigTable, usersTable } from "@workspace/db";
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
  const subs = await db.select().from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, req.userId!))
    .orderBy(desc(subscriptionsTable.createdAt));

  if (subs.length === 0) {
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

  // Prefer the most recent ACTIVE subscription, then fall back to the most recently created
  const active = subs.find((s) => s.status === "ACTIVE");
  res.json(formatSub(active ?? subs[0]));
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

// Grant a free/manual subscription to any user
router.post("/admin/subscriptions/grant", requireAdmin, async (req, res): Promise<void> => {
  const { userId, days, note } = req.body as { userId?: number; days?: number; note?: string };

  if (!userId || !days || days < 1) {
    res.status(400).json({ error: "userId and days (≥1) are required" });
    return;
  }

  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);

  const [sub] = await db.insert(subscriptionsTable).values({
    userId,
    status: "ACTIVE",
    daysSelected: days,
    totalAmount: "0.00",
    feePerDay: "0.00",
    phoneNumber: note ? `MANUAL: ${note}` : "MANUAL",
    startDate,
    endDate,
  }).returning();

  res.status(201).json(formatSub(sub));
});

// Activate a PENDING subscription
router.patch("/admin/subscriptions/:id/activate", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { days, startDate: startDateStr } = req.body as { days?: number; startDate?: string };

  if (!days || days < 1) {
    res.status(400).json({ error: "days (≥1) is required" });
    return;
  }

  const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }

  const startDate = startDateStr ? new Date(startDateStr) : new Date();
  const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);

  const [updated] = await db
    .update(subscriptionsTable)
    .set({ status: "ACTIVE", daysSelected: days, startDate, endDate })
    .where(eq(subscriptionsTable.id, id))
    .returning();

  res.json(formatSub(updated));
});

// Extend an existing subscription by adding more days
router.patch("/admin/subscriptions/:id/extend", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { days } = req.body as { days?: number };

  if (!days || days < 1) {
    res.status(400).json({ error: "days (≥1) is required" });
    return;
  }

  const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }

  // Extend from current endDate if still active, otherwise from now
  const baseDate = existing.endDate && existing.endDate > new Date() ? existing.endDate : new Date();
  const newEndDate = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

  const startDate = existing.startDate ?? new Date();
  const totalMs = newEndDate.getTime() - startDate.getTime();
  const newTotalDays = Math.ceil(totalMs / (24 * 60 * 60 * 1000));

  const [updated] = await db
    .update(subscriptionsTable)
    .set({
      status: "ACTIVE",
      endDate: newEndDate,
      startDate: existing.startDate ?? new Date(),
      daysSelected: newTotalDays,
    })
    .where(eq(subscriptionsTable.id, id))
    .returning();

  res.json(formatSub(updated));
});

// Revoke / cancel a subscription
router.patch("/admin/subscriptions/:id/revoke", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);

  const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }

  const [updated] = await db
    .update(subscriptionsTable)
    .set({ status: "CANCELLED" })
    .where(eq(subscriptionsTable.id, id))
    .returning();

  res.json(formatSub(updated));
});

export default router;
