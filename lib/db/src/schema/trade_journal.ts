import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const tradeOutcomeEnum = pgEnum("trade_outcome", ["WIN", "LOSS", "BREAK_EVEN"]);
export const tradeDirectionEnum = pgEnum("trade_direction_journal", ["BUY", "SELL"]);

export const tradeJournalTable = pgTable("trade_journal", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  pair: text("pair").notNull(),
  direction: tradeDirectionEnum("direction").notNull(),
  entryPrice: text("entry_price").notNull(),
  exitPrice: text("exit_price").notNull(),
  lotSize: text("lot_size").notNull().default("0.01"),
  outcome: tradeOutcomeEnum("outcome").notNull(),
  pnl: text("pnl").notNull(),
  pips: text("pips"),
  notes: text("notes"),
  tradeDate: timestamp("trade_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TradeJournalEntry = typeof tradeJournalTable.$inferSelect;
export type InsertTradeJournalEntry = typeof tradeJournalTable.$inferInsert;
