import { pgTable, serial, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const referralStatusEnum = pgEnum("referral_status", ["PENDING", "REWARDED"]);

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  refereeId: integer("referee_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  refereeBonusDays: integer("referee_bonus_days").notNull().default(3),
  referrerBonusDays: integer("referrer_bonus_days").notNull().default(7),
  status: referralStatusEnum("status").notNull().default("REWARDED"),
  rewardedAt: timestamp("rewarded_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Referral = typeof referralsTable.$inferSelect;
