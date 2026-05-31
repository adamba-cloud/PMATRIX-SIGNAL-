import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const systemAuditLogsTable = pgTable("system_audit_logs", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(),
  severity: text("severity").notNull().default("INFO"),
  payload: text("payload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SystemAuditLog = typeof systemAuditLogsTable.$inferSelect;
