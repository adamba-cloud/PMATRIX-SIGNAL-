import { Router } from "express";
import { db, systemConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateConfigBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

async function getConfigValues() {
  const rows = await db.select().from(systemConfigTable);
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    feePerDay: parseFloat(map["feePerDay"] ?? "150"),
    minDays: parseInt(map["minDays"] ?? "7", 10),
  };
}

router.get("/config", requireAuth, async (_req, res): Promise<void> => {
  const config = await getConfigValues();
  res.json(config);
});

router.put("/config", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { feePerDay, minDays } = parsed.data;

  if (feePerDay !== undefined) {
    const existing = await db.select().from(systemConfigTable).where(eq(systemConfigTable.key, "feePerDay"));
    if (existing.length > 0) {
      await db.update(systemConfigTable).set({ value: String(feePerDay), updatedAt: new Date() }).where(eq(systemConfigTable.key, "feePerDay"));
    } else {
      await db.insert(systemConfigTable).values({ key: "feePerDay", value: String(feePerDay) });
    }
  }

  if (minDays !== undefined) {
    const existing = await db.select().from(systemConfigTable).where(eq(systemConfigTable.key, "minDays"));
    if (existing.length > 0) {
      await db.update(systemConfigTable).set({ value: String(minDays), updatedAt: new Date() }).where(eq(systemConfigTable.key, "minDays"));
    } else {
      await db.insert(systemConfigTable).values({ key: "minDays", value: String(minDays) });
    }
  }

  const config = await getConfigValues();
  res.json(config);
});

export default router;
