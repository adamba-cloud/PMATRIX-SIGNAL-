import { Router } from "express";
import { db, usersTable, referralsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ensureReferralCode } from "../lib/referrals";

const router = Router();

router.get("/referral/stats", requireAuth, async (req, res): Promise<void> => {
  const code = await ensureReferralCode(req.userId!);

  const referrals = await db
    .select({
      id: referralsTable.id,
      status: referralsTable.status,
      refereeBonusDays: referralsTable.refereeBonusDays,
      referrerBonusDays: referralsTable.referrerBonusDays,
      createdAt: referralsTable.createdAt,
    })
    .from(referralsTable)
    .where(eq(referralsTable.referrerId, req.userId!))
    .orderBy(desc(referralsTable.createdAt));

  const totalBonusDays = referrals.reduce((sum, r) => sum + r.referrerBonusDays, 0);

  res.json({
    referralCode: code,
    totalReferrals: referrals.length,
    rewardedCount: referrals.filter((r) => r.status === "REWARDED").length,
    totalBonusDays,
    referrals: referrals.map((r) => ({
      id: r.id,
      status: r.status,
      bonusDays: r.referrerBonusDays,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

router.get("/referral/validate/:code", async (req, res): Promise<void> => {
  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.referralCode, req.params.code.toUpperCase()));

  if (!user) {
    res.status(404).json({ valid: false, error: "Invalid referral code" });
    return;
  }
  res.json({ valid: true, referrerName: user.name });
});

router.get("/admin/referrals", requireAdmin, async (_req, res): Promise<void> => {
  const referrals = await db
    .select({
      id: referralsTable.id,
      status: referralsTable.status,
      refereeBonusDays: referralsTable.refereeBonusDays,
      referrerBonusDays: referralsTable.referrerBonusDays,
      createdAt: referralsTable.createdAt,
      rewardedAt: referralsTable.rewardedAt,
      referrerId: referralsTable.referrerId,
      refereeId: referralsTable.refereeId,
    })
    .from(referralsTable)
    .orderBy(desc(referralsTable.createdAt));

  const userIds = [...new Set(referrals.flatMap((r) => [r.referrerId, r.refereeId]))];
  const users = userIds.length
    ? await db
        .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
        .from(usersTable)
    : [];

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  res.json(
    referrals.map((r) => ({
      id: r.id,
      status: r.status,
      referrer: userMap[r.referrerId] ?? { id: r.referrerId, name: "Unknown", email: "" },
      referee: userMap[r.refereeId] ?? { id: r.refereeId, name: "Unknown", email: "" },
      refereeBonusDays: r.refereeBonusDays,
      referrerBonusDays: r.referrerBonusDays,
      createdAt: r.createdAt.toISOString(),
      rewardedAt: r.rewardedAt?.toISOString() ?? null,
    }))
  );
});

export default router;
