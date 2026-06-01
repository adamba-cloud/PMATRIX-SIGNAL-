import { Router } from "express";
import {
  db,
  slaveAccountsTable,
  copyTradeLinksTable,
  copyTradeLogsTable,
} from "@workspace/db";
import { and, eq, desc, or, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

type LotSizeType = "FIXED" | "PROPORTIONAL";

function num(v: unknown): number | undefined {
  const n = Number(v);
  return isNaN(n) || v === "" || v == null ? undefined : n;
}

function parseLotSizeType(v: unknown): LotSizeType | undefined {
  if (v === "FIXED" || v === "PROPORTIONAL") return v;
  return undefined;
}

function formatLink(l: typeof copyTradeLinksTable.$inferSelect) {
  return {
    id: l.id,
    masterAccountId: l.masterAccountId,
    slaveAccountId: l.slaveAccountId,
    volumeMultiplier: l.volumeMultiplier,
    lotSizeType: l.lotSizeType,
    isActive: l.isActive,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

function formatLog(l: typeof copyTradeLogsTable.$inferSelect) {
  return {
    id: l.id,
    masterAccountId: l.masterAccountId,
    slaveAccountId: l.slaveAccountId,
    jobId: l.jobId ?? null,
    masterTicket: l.masterTicket,
    slaveTicket: l.slaveTicket ?? null,
    symbol: l.symbol,
    direction: l.direction,
    volume: l.volume,
    entryPrice: l.entryPrice ?? null,
    stopLoss: l.stopLoss ?? null,
    takeProfit: l.takeProfit ?? null,
    masterBalance: l.masterBalance ?? null,
    slaveBalance: l.slaveBalance ?? null,
    masterLots: l.masterLots ?? null,
    calculatedLots: l.calculatedLots ?? null,
    status: l.status,
    errorMessage: l.errorMessage ?? null,
    executedAt: l.executedAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

// ─── Links ───────────────────────────────────────────────────────────────────

router.get("/copy-trading/links", requireAuth, async (req, res): Promise<void> => {
  const userAccounts = await db
    .select({ id: slaveAccountsTable.id })
    .from(slaveAccountsTable)
    .where(eq(slaveAccountsTable.userId, req.userId!));

  if (userAccounts.length === 0) {
    res.json([]);
    return;
  }

  const accountIds = userAccounts.map((a) => a.id);

  const links = await db
    .select()
    .from(copyTradeLinksTable)
    .where(
      or(
        inArray(copyTradeLinksTable.masterAccountId, accountIds),
        inArray(copyTradeLinksTable.slaveAccountId, accountIds)
      )
    )
    .orderBy(desc(copyTradeLinksTable.createdAt));

  res.json(links.map(formatLink));
});

router.post("/copy-trading/links", requireAuth, async (req, res): Promise<void> => {
  const masterAccountId = num(req.body.masterAccountId);
  const slaveAccountId = num(req.body.slaveAccountId);
  const volumeMultiplier = String(parseFloat(req.body.volumeMultiplier ?? "1") || 1);
  const lotSizeType: LotSizeType = parseLotSizeType(req.body.lotSizeType) ?? "FIXED";

  if (!masterAccountId || !slaveAccountId) {
    res.status(400).json({ error: "masterAccountId and slaveAccountId are required" });
    return;
  }
  if (masterAccountId === slaveAccountId) {
    res.status(400).json({ error: "Master and slave accounts must be different" });
    return;
  }

  const userAccounts = await db
    .select({ id: slaveAccountsTable.id })
    .from(slaveAccountsTable)
    .where(eq(slaveAccountsTable.userId, req.userId!));

  const ownedIds = new Set(userAccounts.map((a) => a.id));
  if (!ownedIds.has(masterAccountId) || !ownedIds.has(slaveAccountId)) {
    res.status(403).json({ error: "Both accounts must belong to you" });
    return;
  }

  try {
    const [link] = await db
      .insert(copyTradeLinksTable)
      .values({ masterAccountId, slaveAccountId, userId: req.userId!, volumeMultiplier, lotSizeType, isActive: true })
      .onConflictDoUpdate({
        target: [copyTradeLinksTable.masterAccountId, copyTradeLinksTable.slaveAccountId],
        set: { isActive: true, volumeMultiplier, lotSizeType, updatedAt: new Date() },
      })
      .returning();

    logger.info({ linkId: link.id, masterAccountId, slaveAccountId, lotSizeType }, "Copy trade link created");
    res.status(201).json(formatLink(link));
  } catch (err) {
    logger.error({ err }, "Failed to create copy trade link");
    res.status(500).json({ error: "Failed to create link" });
  }
});

router.patch("/copy-trading/links/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid link ID" }); return; }

  const [existing] = await db
    .select()
    .from(copyTradeLinksTable)
    .where(and(eq(copyTradeLinksTable.id, id), eq(copyTradeLinksTable.userId, req.userId!)));

  if (!existing) { res.status(404).json({ error: "Link not found" }); return; }

  const updates: Partial<typeof copyTradeLinksTable.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (req.body.isActive !== undefined) updates.isActive = Boolean(req.body.isActive);
  if (req.body.volumeMultiplier !== undefined) {
    updates.volumeMultiplier = String(parseFloat(req.body.volumeMultiplier) || 1);
  }
  const newLotSizeType = parseLotSizeType(req.body.lotSizeType);
  if (newLotSizeType !== undefined) updates.lotSizeType = newLotSizeType;

  const [updated] = await db
    .update(copyTradeLinksTable)
    .set(updates)
    .where(eq(copyTradeLinksTable.id, id))
    .returning();

  res.json(formatLink(updated));
});

router.delete("/copy-trading/links/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid link ID" }); return; }

  const [existing] = await db
    .select()
    .from(copyTradeLinksTable)
    .where(and(eq(copyTradeLinksTable.id, id), eq(copyTradeLinksTable.userId, req.userId!)));

  if (!existing) { res.status(404).json({ error: "Link not found" }); return; }

  await db.delete(copyTradeLinksTable).where(eq(copyTradeLinksTable.id, id));
  res.status(204).send();
});

// ─── Audit Logs ──────────────────────────────────────────────────────────────

router.get("/copy-trading/logs", requireAuth, async (req, res): Promise<void> => {
  const limit = Math.min(num(req.query.limit) ?? 50, 200);
  const offset = Math.max(num(req.query.offset) ?? 0, 0);

  const userAccounts = await db
    .select({ id: slaveAccountsTable.id })
    .from(slaveAccountsTable)
    .where(eq(slaveAccountsTable.userId, req.userId!));

  if (userAccounts.length === 0) {
    res.json({ logs: [], limit, offset });
    return;
  }

  const accountIds = userAccounts.map((a) => a.id);

  const logs = await db
    .select()
    .from(copyTradeLogsTable)
    .where(
      or(
        inArray(copyTradeLogsTable.masterAccountId, accountIds),
        inArray(copyTradeLogsTable.slaveAccountId, accountIds)
      )
    )
    .orderBy(desc(copyTradeLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ logs: logs.map(formatLog), limit, offset });
});

// ─── Admin ────────────────────────────────────────────────────────────────────

router.get("/admin/copy-trading/logs", requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(num(req.query.limit) ?? 100, 500);
  const offset = Math.max(num(req.query.offset) ?? 0, 0);

  const logs = await db
    .select()
    .from(copyTradeLogsTable)
    .orderBy(desc(copyTradeLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ logs: logs.map(formatLog), limit, offset });
});

export default router;
