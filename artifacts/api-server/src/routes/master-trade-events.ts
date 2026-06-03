import { Router } from "express";
import { db, masterTradeEventsTable } from "@workspace/db";
import { desc, eq, gte, sql, and } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

// ─── GET /api/admin/master/trade-events/stats ─────────────────────────────────

router.get("/admin/master/trade-events/stats", requireAdmin, async (_req, res): Promise<void> => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [totalRow] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(masterTradeEventsTable);

  const [todayRow] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(masterTradeEventsTable)
    .where(gte(masterTradeEventsTable.createdAt, todayStart));

  const byType = await db
    .select({
      eventType: masterTradeEventsTable.eventType,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(masterTradeEventsTable)
    .groupBy(masterTradeEventsTable.eventType);

  res.json({
    total: totalRow?.count ?? 0,
    today: todayRow?.count ?? 0,
    byType: Object.fromEntries(byType.map((r) => [r.eventType, r.count])),
  });
});

// ─── GET /api/admin/master/trade-events ──────────────────────────────────────

router.get("/admin/master/trade-events", requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const eventType = req.query.eventType as string | undefined;

  const where = eventType
    ? eq(masterTradeEventsTable.eventType, eventType as "POSITION_OPENED" | "POSITION_MODIFIED" | "POSITION_CLOSED")
    : undefined;

  const [events, [countRow]] = await Promise.all([
    db
      .select()
      .from(masterTradeEventsTable)
      .where(where)
      .orderBy(desc(masterTradeEventsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(masterTradeEventsTable)
      .where(where),
  ]);

  res.json({ events, total: countRow?.count ?? 0, limit, offset });
});

export default router;
