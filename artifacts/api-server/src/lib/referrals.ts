import { db, usersTable, referralsTable, subscriptionsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { logger } from "./logger";

const REFEREE_BONUS_DAYS = 3;
const REFERRER_BONUS_DAYS = 7;

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

  // Lazily generate for existing users
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

    // Give referee their free trial days
    await extendOrCreateSubscription(refereeId, REFEREE_BONUS_DAYS);

    // Give referrer their bonus days
    await extendOrCreateSubscription(referrerId, REFERRER_BONUS_DAYS);

    // Record the referral
    await db.insert(referralsTable).values({
      referrerId,
      refereeId,
      refereeBonusDays: REFEREE_BONUS_DAYS,
      referrerBonusDays: REFERRER_BONUS_DAYS,
      status: "REWARDED",
      rewardedAt: now,
    });

    logger.info({ referrerId, refereeId, REFEREE_BONUS_DAYS, REFERRER_BONUS_DAYS }, "Referral reward applied");
  } catch (err) {
    logger.error({ err, referrerId, refereeId }, "Referral reward failed");
  }
}
