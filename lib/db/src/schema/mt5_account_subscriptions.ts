import { pgTable, serial, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { slaveAccountsTable } from "./slave_accounts";

export const mt5SubStatusEnum = pgEnum("mt5_sub_status", ["ACTIVE", "EXPIRED", "PENDING"]);

export const mt5AccountSubscriptionsTable = pgTable("mt5_account_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  slaveAccountId: integer("slave_account_id").notNull().references(() => slaveAccountsTable.id),
  paymentId: integer("payment_id"),
  numberOfDays: integer("number_of_days").notNull(),
  feePerAccountPerDay: numeric("fee_per_account_per_day", { precision: 12, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  startDate: timestamp("start_date"),
  expiryDate: timestamp("expiry_date"),
  status: mt5SubStatusEnum("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Mt5AccountSubscription = typeof mt5AccountSubscriptionsTable.$inferSelect;
