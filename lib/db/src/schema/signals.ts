import { pgTable, serial, text, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const signalDirectionEnum = pgEnum("signal_direction", ["BUY", "SELL"]);
export const signalStatusEnum = pgEnum("signal_status", ["ACTIVE", "CLOSED", "PENDING"]);

export const signalsTable = pgTable("signals", {
  id: serial("id").primaryKey(),
  pair: text("pair").notNull(),
  direction: signalDirectionEnum("direction").notNull(),
  entryPrice: numeric("entry_price", { precision: 18, scale: 5 }).notNull(),
  stopLoss: numeric("stop_loss", { precision: 18, scale: 5 }).notNull(),
  takeProfit: numeric("take_profit", { precision: 18, scale: 5 }).notNull(),
  status: signalStatusEnum("status").notNull().default("PENDING"),
  pips: numeric("pips", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSignalSchema = createInsertSchema(signalsTable).omit({ id: true, createdAt: true });
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Signal = typeof signalsTable.$inferSelect;
