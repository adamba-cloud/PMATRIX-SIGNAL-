import { pgTable, serial, text, pgEnum, timestamp, numeric } from "drizzle-orm/pg-core";

export const masterTradeEventTypeEnum = pgEnum("master_trade_event_type", [
  "POSITION_OPENED",
  "POSITION_MODIFIED",
  "POSITION_CLOSED",
]);

export const masterTradeEventsTable = pgTable("master_trade_events", {
  id: serial("id").primaryKey(),
  metaApiAccountId: text("meta_api_account_id").notNull(),
  eventType: masterTradeEventTypeEnum("event_type").notNull(),
  positionId: text("position_id").notNull(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  volume: numeric("volume", { precision: 18, scale: 8 }),
  openPrice: numeric("open_price", { precision: 18, scale: 8 }),
  currentPrice: numeric("current_price", { precision: 18, scale: 8 }),
  stopLoss: numeric("stop_loss", { precision: 18, scale: 8 }),
  takeProfit: numeric("take_profit", { precision: 18, scale: 8 }),
  profit: numeric("profit", { precision: 18, scale: 8 }),
  comment: text("comment"),
  changedFields: text("changed_fields"),
  rawPayload: text("raw_payload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MasterTradeEvent = typeof masterTradeEventsTable.$inferSelect;
export type InsertMasterTradeEvent = typeof masterTradeEventsTable.$inferInsert;
