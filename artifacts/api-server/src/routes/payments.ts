import { Router } from "express";
import { db, paymentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

function formatPayment(p: typeof paymentsTable.$inferSelect) {
  return {
    id: p.id,
    userId: p.userId,
    subscriptionId: p.subscriptionId ?? null,
    amount: parseFloat(p.amount),
    status: p.status,
    method: p.method,
    reference: p.reference ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/payments/my", requireAuth, async (req, res): Promise<void> => {
  const payments = await db.select().from(paymentsTable)
    .where(eq(paymentsTable.userId, req.userId!))
    .orderBy(desc(paymentsTable.createdAt));
  res.json(payments.map(formatPayment));
});

router.get("/payments", requireAdmin, async (_req, res): Promise<void> => {
  const payments = await db.select().from(paymentsTable).orderBy(desc(paymentsTable.createdAt));
  res.json(payments.map(formatPayment));
});

export default router;
