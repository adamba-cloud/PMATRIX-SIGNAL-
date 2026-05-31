import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const mt5ConnectionStatusEnum = pgEnum("mt5_connection_status", [
  "CONNECTED",
  "SYNCING",
  "DISCONNECTED",
  "ERROR",
]);

export const slaveAccountsTable = pgTable("slave_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  mt5Login: text("mt5_login").notNull(),
  passwordEncrypted: text("password_encrypted").notNull(),
  encryptionIv: text("encryption_iv").notNull(),
  encryptionTag: text("encryption_tag").notNull(),
  brokerServer: text("broker_server").notNull(),
  status: mt5ConnectionStatusEnum("status").notNull().default("DISCONNECTED"),
  statusMessage: text("status_message"),
  metaApiAccountId: text("meta_api_account_id"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSlaveAccountSchema = createInsertSchema(slaveAccountsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSlaveAccount = z.infer<typeof insertSlaveAccountSchema>;
export type SlaveAccount = typeof slaveAccountsTable.$inferSelect;
