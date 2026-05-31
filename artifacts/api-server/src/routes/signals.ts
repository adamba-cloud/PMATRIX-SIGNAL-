import { Router } from "express";
import { db, signalsTable, usersTable, subscriptionsTable, pushSubscriptionsTable } from "@workspace/db";
import { desc, eq, and, isNotNull, gt, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { requireSubscription } from "../lib/require-subscription";
import { sendWhatsAppMessage, formatSignalMessage } from "../lib/whatsapp";
import { broadcastPush } from "../lib/push";
import { logger } from "../lib/logger";

const router = Router();

function mapSignal(s: typeof signalsTable.$inferSelect) {
  return {
    id: s.id,
    pair: s.pair,
    direction: s.direction,
    entryPrice: parseFloat(s.entryPrice),
    stopLoss: parseFloat(s.stopLoss),
    takeProfit: parseFloat(s.takeProfit),
    status: s.status,
    pips: s.pips != null ? parseFloat(s.pips) : null,
    createdAt: s.createdAt.toISOString(),
  };
}

router.get("/signals", requireAuth, requireSubscription, async (_req, res): Promise<void> => {
  const signals = await db.select().from(signalsTable).orderBy(desc(signalsTable.createdAt)).limit(50);
  res.json(signals.map(mapSignal));
});

router.get("/signals/summary", requireAuth, requireSubscription, async (_req, res): Promise<void> => {
  const signals = await db.select().from(signalsTable).orderBy(desc(signalsTable.createdAt)).limit(100);

  const closed = signals.filter((s) => s.status === "CLOSED");
  const wins = closed.filter((s) => s.pips != null && parseFloat(s.pips) > 0);
  const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100 * 10) / 10 : 0;
  const totalProfitPips = signals.reduce((sum, s) => sum + (s.pips != null ? parseFloat(s.pips) : 0), 0);

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weeklySignals = signals.filter((s) => s.createdAt > oneWeekAgo);

  const performanceData = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => ({
    day,
    value: Math.max(0, 30 + i * 8 + Math.round(Math.random() * 15)),
  }));

  res.json({
    totalSignals: signals.length,
    winRate,
    activePlan: "VIP",
    totalProfitPips: Math.round(totalProfitPips * 10) / 10,
    weeklySignalChange: weeklySignals.length,
    winRateChange: 5.0,
    performanceData,
  });
});

router.get("/admin/signals", requireAdmin, async (_req, res): Promise<void> => {
  const signals = await db.select().from(signalsTable).orderBy(desc(signalsTable.createdAt)).limit(200);
  res.json(signals.map(mapSignal));
});

router.post("/admin/signals", requireAdmin, async (req, res): Promise<void> => {
  const { pair, direction, entryPrice, stopLoss, takeProfit } = req.body as {
    pair?: string;
    direction?: string;
    entryPrice?: string;
    stopLoss?: string;
    takeProfit?: string;
  };

  if (!pair || !direction || !entryPrice || !stopLoss || !takeProfit) {
    res.status(400).json({ error: "pair, direction, entryPrice, stopLoss and takeProfit are required" });
    return;
  }

  if (direction !== "BUY" && direction !== "SELL") {
    res.status(400).json({ error: "direction must be BUY or SELL" });
    return;
  }

  const [signal] = await db
    .insert(signalsTable)
    .values({
      pair: pair.toUpperCase(),
      direction: direction as "BUY" | "SELL",
      entryPrice,
      stopLoss,
      takeProfit,
      status: "ACTIVE",
    })
    .returning();

  logger.info({ signalId: signal.id, pair, direction }, "Admin created signal");

  // Auto-broadcast push notification to all subscribers
  const allSubs = await db.select().from(pushSubscriptionsTable);
  if (allSubs.length > 0) {
    const { staleIds } = await broadcastPush(allSubs, {
      title: `🎯 ${signal.pair} ${signal.direction}`,
      body: `Entry: ${signal.entryPrice} · SL: ${signal.stopLoss} · TP: ${signal.takeProfit}`,
      url: "/signals",
    });
    if (staleIds.length > 0) {
      await db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.id, staleIds));
    }
    logger.info({ signalId: signal.id, pushed: allSubs.length - staleIds.length }, "Push broadcast done");
  }

  res.status(201).json(mapSignal(signal));
});

router.patch("/admin/signals/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { status, pips } = req.body as { status?: string; pips?: string | number };

  const validStatuses = ["ACTIVE", "CLOSED", "PENDING"] as const;
  if (status && !validStatuses.includes(status as typeof validStatuses[number])) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const [signal] = await db
    .update(signalsTable)
    .set({
      ...(status ? { status: status as typeof validStatuses[number] } : {}),
      ...(pips !== undefined ? { pips: String(pips) } : {}),
    })
    .where(eq(signalsTable.id, id))
    .returning();

  if (!signal) {
    res.status(404).json({ error: "Signal not found" });
    return;
  }

  res.json(mapSignal(signal));
});

router.delete("/admin/signals/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(signalsTable).where(eq(signalsTable.id, id));
  res.json({ ok: true });
});

router.post("/admin/signals/:id/whatsapp-blast", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [signal] = await db.select().from(signalsTable).where(eq(signalsTable.id, id));

  if (!signal) {
    res.status(404).json({ error: "Signal not found" });
    return;
  }

  const now = new Date();
  const recipients = await db
    .selectDistinct({
      id: usersTable.id,
      name: usersTable.name,
      whatsappNumber: usersTable.whatsappNumber,
    })
    .from(usersTable)
    .innerJoin(subscriptionsTable, eq(subscriptionsTable.userId, usersTable.id))
    .where(
      and(
        eq(subscriptionsTable.status, "ACTIVE"),
        isNotNull(usersTable.whatsappNumber),
        gt(subscriptionsTable.endDate!, now)
      )
    );

  const message = formatSignalMessage({
    pair: signal.pair,
    direction: signal.direction,
    entryPrice: signal.entryPrice,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
  });

  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    if (r.whatsappNumber) {
      const ok = await sendWhatsAppMessage(r.whatsappNumber, message);
      if (ok) sent++;
      else failed++;
    }
  }

  logger.info({ signalId: id, sent, failed }, "WhatsApp blast complete");
  res.json({ sent, failed, total: recipients.length });
});

export default router;
