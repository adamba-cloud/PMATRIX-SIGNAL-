import { pgTable, serial, integer, boolean, numeric, timestamp, unique } from "drizzle-orm/pg-core";
import { slaveAccountsTable } from "./slave_accounts";
import { usersTable } from "./users";

export const copyTradeLinksTable = pgTable(
  "copy_trade_links",
  {
    id: serial("id").primaryKey(),
    masterAccountId: integer("master_account_id")
      .notNull()
      .references(() => slaveAccountsTable.id, { onDelete: "cascade" }),
    slaveAccountId: integer("slave_account_id")
      .notNull()
      .references(() => slaveAccountsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    volumeMultiplier: numeric("volume_multiplier", { precision: 10, scale: 4 })
      .notNull()
      .default("1"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("uq_copy_link").on(t.masterAccountId, t.slaveAccountId)]
);

export type CopyTradeLink = typeof copyTradeLinksTable.$inferSelect;
export type InsertCopyTradeLink = typeof copyTradeLinksTable.$inferInsert;
