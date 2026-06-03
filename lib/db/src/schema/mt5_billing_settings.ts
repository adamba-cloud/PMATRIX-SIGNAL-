import { pgTable, serial, numeric, integer, timestamp } from "drizzle-orm/pg-core";

export const mt5BillingSettingsTable = pgTable("mt5_billing_settings", {
  id: serial("id").primaryKey(),
  feePerAccountPerDay: numeric("fee_per_account_per_day", { precision: 12, scale: 2 }).notNull().default("50"),
  minimumSubscriptionDays: integer("minimum_subscription_days").notNull().default(7),
  maximumMt5Accounts: integer("maximum_mt5_accounts").notNull().default(5),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Mt5BillingSettings = typeof mt5BillingSettingsTable.$inferSelect;
