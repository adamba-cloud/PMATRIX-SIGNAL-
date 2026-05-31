import { Router } from "express";
import { db, signalsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/signals", requireAuth, async (_req, res): Promise<void> => {
  const signals = await db.select().from(signalsTable).orderBy(desc(signalsTable.createdAt)).limit(50);
  res.json(signals.map(s => ({
    id: s.id,
    pair: s.pair,
    direction: s.direction,
    entryPrice: parseFloat(s.entryPrice),
    stopLoss: parseFloat(s.stopLoss),
    takeProfit: parseFloat(s.takeProfit),
    status: s.status,
    pips: s.pips != null ? parseFloat(s.pips) : null,
    createdAt: s.createdAt.toISOString(),
  })));
});

router.get("/signals/summary", requireAuth, async (_req, res): Promise<void> => {
  const signals = await db.select().from(signalsTable).orderBy(desc(signalsTable.createdAt)).limit(100);

  const closed = signals.filter(s => s.status === "CLOSED");
  const wins = closed.filter(s => s.pips != null && parseFloat(s.pips) > 0);
  const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100 * 10) / 10 : 0;
  const totalProfitPips = signals.reduce((sum, s) => sum + (s.pips != null ? parseFloat(s.pips) : 0), 0);

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weeklySignals = signals.filter(s => s.createdAt > oneWeekAgo);

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

export default router;
