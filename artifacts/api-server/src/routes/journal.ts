import { Router } from "express";
import { db } from "@workspace/db";
import { tradeJournalTable } from "@workspace/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

function mapTrade(t: typeof tradeJournalTable.$inferSelect) {
  return {
    id: t.id,
    pair: t.pair,
    direction: t.direction,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    lotSize: t.lotSize,
    outcome: t.outcome,
    pnl: t.pnl,
    pips: t.pips,
    notes: t.notes,
    tradeDate: t.tradeDate.toISOString(),
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/journal/stats", requireAuth, async (req, res): Promise<void> => {
  const trades = await db
    .select()
    .from(tradeJournalTable)
    .where(eq(tradeJournalTable.userId, req.userId!))
    .orderBy(asc(tradeJournalTable.tradeDate));

  const total = trades.length;
  const wins = trades.filter((t) => t.outcome === "WIN").length;
  const losses = trades.filter((t) => t.outcome === "LOSS").length;
  const breakEvens = trades.filter((t) => t.outcome === "BREAK_EVEN").length;
  const winRate = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;
  const totalPnl = trades.reduce((sum, t) => sum + parseFloat(t.pnl), 0);
  const avgPnl = total > 0 ? totalPnl / total : 0;

  let currentStreak = 0;
  let currentStreakType = "";
  let bestWinStreak = 0;
  let tempStreak = 0;

  if (trades.length > 0) {
    currentStreakType = trades[trades.length - 1].outcome;
    for (let i = trades.length - 1; i >= 0; i--) {
      if (trades[i].outcome === currentStreakType) currentStreak++;
      else break;
    }
  }

  for (const t of trades) {
    if (t.outcome === "WIN") {
      tempStreak++;
      bestWinStreak = Math.max(bestWinStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }

  const dailyMap: Record<string, number> = {};
  for (const t of trades) {
    const day = t.tradeDate.toISOString().split("T")[0];
    dailyMap[day] = (dailyMap[day] ?? 0) + parseFloat(t.pnl);
  }
  const dailyPnl = Object.entries(dailyMap)
    .map(([date, pnl]) => ({ date, pnl: Math.round(pnl * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-60);

  const pairBreakdown: Record<string, { trades: number; pnl: number; wins: number }> = {};
  for (const t of trades) {
    if (!pairBreakdown[t.pair]) pairBreakdown[t.pair] = { trades: 0, pnl: 0, wins: 0 };
    pairBreakdown[t.pair].trades++;
    pairBreakdown[t.pair].pnl += parseFloat(t.pnl);
    if (t.outcome === "WIN") pairBreakdown[t.pair].wins++;
  }
  const topPairs = Object.entries(pairBreakdown)
    .map(([pair, data]) => ({ pair, ...data, pnl: Math.round(data.pnl * 100) / 100 }))
    .sort((a, b) => b.trades - a.trades)
    .slice(0, 5);

  res.json({
    total,
    wins,
    losses,
    breakEvens,
    winRate,
    totalPnl: Math.round(totalPnl * 100) / 100,
    avgPnl: Math.round(avgPnl * 100) / 100,
    currentStreak,
    currentStreakType,
    bestWinStreak,
    dailyPnl,
    topPairs,
  });
});

router.get("/journal", requireAuth, async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const offset = parseInt(req.query.offset as string) || 0;

  const trades = await db
    .select()
    .from(tradeJournalTable)
    .where(eq(tradeJournalTable.userId, req.userId!))
    .orderBy(desc(tradeJournalTable.tradeDate))
    .limit(limit)
    .offset(offset);

  res.json({ trades: trades.map(mapTrade), limit, offset });
});

router.post("/journal", requireAuth, async (req, res): Promise<void> => {
  const { pair, direction, entryPrice, exitPrice, lotSize, outcome, pnl, pips, notes, tradeDate } = req.body as {
    pair: string;
    direction: "BUY" | "SELL";
    entryPrice: string;
    exitPrice: string;
    lotSize?: string;
    outcome: "WIN" | "LOSS" | "BREAK_EVEN";
    pnl: string;
    pips?: string;
    notes?: string;
    tradeDate: string;
  };

  if (!pair || !direction || !entryPrice || !exitPrice || !outcome || pnl === undefined || !tradeDate) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const [trade] = await db
    .insert(tradeJournalTable)
    .values({
      userId: req.userId!,
      pair: pair.toUpperCase().trim(),
      direction,
      entryPrice,
      exitPrice,
      lotSize: lotSize ?? "0.01",
      outcome,
      pnl,
      pips: pips ?? null,
      notes: notes ?? null,
      tradeDate: new Date(tradeDate),
    })
    .returning();

  res.status(201).json(mapTrade(trade));
});

router.patch("/journal/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const existing = await db
    .select()
    .from(tradeJournalTable)
    .where(eq(tradeJournalTable.id, id));

  if (!existing[0] || existing[0].userId !== req.userId!) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  const { pair, direction, entryPrice, exitPrice, lotSize, outcome, pnl, pips, notes, tradeDate } = req.body;

  const [updated] = await db
    .update(tradeJournalTable)
    .set({
      ...(pair !== undefined && { pair: pair.toUpperCase().trim() }),
      ...(direction !== undefined && { direction }),
      ...(entryPrice !== undefined && { entryPrice }),
      ...(exitPrice !== undefined && { exitPrice }),
      ...(lotSize !== undefined && { lotSize }),
      ...(outcome !== undefined && { outcome }),
      ...(pnl !== undefined && { pnl }),
      ...(pips !== undefined && { pips }),
      ...(notes !== undefined && { notes }),
      ...(tradeDate !== undefined && { tradeDate: new Date(tradeDate) }),
    })
    .where(eq(tradeJournalTable.id, id))
    .returning();

  res.json(mapTrade(updated));
});

router.delete("/journal/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const existing = await db.select().from(tradeJournalTable).where(eq(tradeJournalTable.id, id));

  if (!existing[0] || existing[0].userId !== req.userId!) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  await db.delete(tradeJournalTable).where(eq(tradeJournalTable.id, id));
  res.status(204).send();
});

export default router;
