import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const resourceLinkTypeEnum = pgEnum("resource_link_type", [
  "YOUTUBE",
  "WEBSITE",
  "TELEGRAM",
  "EDUCATIONAL",
]);

export const resourceLinksTable = pgTable("resource_links", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url").notNull(),
  linkType: resourceLinkTypeEnum("link_type").notNull().default("WEBSITE"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertResourceLinkSchema = createInsertSchema(resourceLinksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertResourceLink = z.infer<typeof insertResourceLinkSchema>;
export type ResourceLink = typeof resourceLinksTable.$inferSelect;
