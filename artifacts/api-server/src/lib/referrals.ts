import { db, usersTable, referralsTable, subscriptionsTable, systemConfigTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_REFEREE_BONUS_DAYS = 3;
const DEFAULT_REFERRER_BONUS_DAYS = 7;

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateReferralCode(): string {
  return Array.from(
    { length: 8 },
    () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  ).join("");
}

export async function ensureReferralCode(userId: number): Promise<string> {
  const [user] = await db.select({ referralCode: usersTable.referralCode }).from(usersTable).where(eq(usersTable.id, userId));
  if (user?.referralCode) return user.referralCode;

  let code = generateReferralCode();
  let attempts = 0;
  while (attempts < 5) {
    const [conflict] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, code));
    if (!conflict) break;
    code = generateReferralCode();
    attempts++;
  }
  await db.update(usersTable).set({ referralCode: code }).where(eq(usersTable.id, userId));
  return code;
}

export async function getReferralSettings(): Promise<{ refereeBonusDays: number; referrerBonusDays: number }> {
  const rows = await db
    .select({ key: systemConfigTable.key, value: systemConfigTable.value })
    .from(systemConfigTable)
    .where(eq(systemConfigTable.key, "referral_referee_bonus_days"));

  const rows2 = await db
    .select({ key: systemConfigTable.key, value: systemConfigTable.value })
    .from(systemConfigTable)
    .where(eq(systemConfigTable.key, "referral_referrer_bonus_days"));

  const refereeBonusDays = rows[0] ? parseInt(rows[0].value, 10) : DEFAULT_REFEREE_BONUS_DAYS;
  const referrerBonusDays = rows2[0] ? parseInt(rows2[0].value, 10) : DEFAULT_REFERRER_BONUS_DAYS;

  return {
    refereeBonusDays: isNaN(refereeBonusDays) ? DEFAULT_REFEREE_BONUS_DAYS : refereeBonusDays,
    referrerBonusDays: isNaN(referrerBonusDays) ? DEFAULT_REFERRER_BONUS_DAYS : referrerBonusDays,
  };
}

export async function setReferralSettings(refereeBonusDays?: number, referrerBonusDays?: number): Promise<void> {
  const now = new Date();
  if (refereeBonusDays != null) {
    const existing = await db.select().from(systemConfigTable).where(eq(systemConfigTable.key, "referral_referee_bonus_days"));
    if (existing.length) {
      await db.update(systemConfigTable).set({ value: String(refereeBonusDays), updatedAt: now }).where(eq(systemConfigTable.key, "referral_referee_bonus_days"));
    } else {
      await db.insert(systemConfigTable).values({ key: "referral_referee_bonus_days", value: String(refereeBonusDays) });
    }
  }
  if (referrerBonusDays != null) {
    const existing = await db.select().from(systemConfigTable).where(eq(systemConfigTable.key, "referral_referrer_bonus_days"));
    if (existing.length) {
      await db.update(systemConfigTable).set({ value: String(referrerBonusDays), updatedAt: now }).where(eq(systemConfigTable.key, "referral_referrer_bonus_days"));
    } else {
      await db.insert(systemConfigTable).values({ key: "referral_referrer_bonus_days", value: String(referrerBonusDays) });
    }
  }
}

async function extendOrCreateSubscription(userId: number, bonusDays: number): Promise<void> {
  const now = new Date();
  const [activeSub] = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "ACTIVE")))
    .orderBy(desc(subscriptionsTable.endDate))
    .limit(1);

  if (activeSub?.endDate) {
    const base = activeSub.endDate > now ? activeSub.endDate : now;
    const newEnd = new Date(base.getTime() + bonusDays * 24 * 60 * 60 * 1000);
    await db.update(subscriptionsTable).set({ endDate: newEnd }).where(eq(subscriptionsTable.id, activeSub.id));
  } else {
    const startDate = now;
    const endDate = new Date(now.getTime() + bonusDays * 24 * 60 * 60 * 1000);
    await db.insert(subscriptionsTable).values({
      userId,
      status: "ACTIVE",
      daysSelected: bonusDays,
      totalAmount: "0",
      feePerDay: "0",
      startDate,
      endDate,
    });
  }
}

export async function applyReferralReward(referrerId: number, refereeId: number): Promise<void> {
  try {
    const now = new Date();
    const { refereeBonusDays, referrerBonusDays } = await getReferralSettings();

    await extendOrCreateSubscription(refereeId, refereeBonusDays);
    await extendOrCreateSubscription(referrerId, referrerBonusDays);

    await db.insert(referralsTable).values({
      referrerId,
      refereeId,
      refereeBonusDays,
      referrerBonusDays,
      status: "REWARDED",
      rewardedAt: now,
    });

    logger.info({ referrerId, refereeId, refereeBonusDays, referrerBonusDays }, "Referral reward applied");
  } catch (err) {
    logger.error({ err, referrerId, refereeId }, "Referral reward failed");
  }
}
