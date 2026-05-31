import { pgTable, serial, integer, text, pgEnum, timestamp } from "drizzle-orm/pg-core";
import { slaveAccountsTable } from "./slave_accounts";

export const copyTradeStatusEnum = pgEnum("copy_trade_status", [
  "PENDING",
  "SUCCESS",
  "FAILED",
  "SKIPPED",
]);

export const copyTradeLogsTable = pgTable("copy_trade_logs", {
  id: serial("id").primaryKey(),
  masterAccountId: integer("master_account_id")
    .notNull()
    .references(() => slaveAccountsTable.id),
  slaveAccountId: integer("slave_account_id")
    .notNull()
    .references(() => slaveAccountsTable.id),
  jobId: text("job_id"),
  masterTicket: text("master_ticket").notNull(),
  slaveTicket: text("slave_ticket"),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  volume: text("volume").notNull(),
  entryPrice: text("entry_price"),
  stopLoss: text("stop_loss"),
  takeProfit: text("take_profit"),
  status: copyTradeStatusEnum("status").notNull().default("PENDING"),
  errorMessage: text("error_message"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CopyTradeLog = typeof copyTradeLogsTable.$inferSelect;
export type InsertCopyTradeLog = typeof copyTradeLogsTable.$inferInsert;
