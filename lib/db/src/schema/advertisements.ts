import { pgTable, serial, text, integer, numeric, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const adStatusEnum = pgEnum("ad_status", ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "PAUSED"]);
export const adMediaTypeEnum = pgEnum("ad_media_type", ["IMAGE", "VIDEO", "LINK"]);

export const advertisementsTable = pgTable("advertisements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  mediaType: adMediaTypeEnum("media_type").notNull(),
  mediaUrl: text("media_url"),
  externalLink: text("external_link"),
  status: adStatusEnum("status").notNull().default("PENDING"),
  totalDays: integer("total_days").notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  isPaid: boolean("is_paid").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const advertisementSettingsTable = pgTable("advertisement_settings", {
  id: serial("id").primaryKey(),
  feePerDay: numeric("fee_per_day", { precision: 12, scale: 2 }).notNull().default("100"),
  minDays: integer("min_days").notNull().default(1),
  maxDays: integer("max_days").notNull().default(90),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Advertisement = typeof advertisementsTable.$inferSelect;
export type AdvertisementSettings = typeof advertisementSettingsTable.$inferSelect;
