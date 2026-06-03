import { Router } from "express";
import { db, usersTable, referralsTable } from "@workspace/db";
import { eq, desc, sql, sum, count } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ensureReferralCode, getReferralSettings, setReferralSettings } from "../lib/referrals";

const router = Router();

router.get("/referral/stats", requireAuth, async (req, res): Promise<void> => {
  const code = await ensureReferralCode(req.userId!);
  const settings = await getReferralSettings();

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
    refereeBonusDays: settings.refereeBonusDays,
    referrerBonusDays: settings.referrerBonusDays,
    referrals: referrals.map((r) => ({
      id: r.id,
      status: r.status,
      bonusDays: r.referrerBonusDays,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

router.get("/referral/settings", async (_req, res): Promise<void> => {
  try {
    const settings = await getReferralSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to load referral settings" });
  }
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
  const settings = await getReferralSettings();

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

  // Build leaderboard: group by referrerId, sum bonus days earned, count referrals
  const leaderboardRaw = await db
    .select({
      referrerId: referralsTable.referrerId,
      totalReferrals: count(referralsTable.id),
      totalBonusDaysEarned: sum(referralsTable.referrerBonusDays),
    })
    .from(referralsTable)
    .groupBy(referralsTable.referrerId)
    .orderBy(sql`count(${referralsTable.id}) desc`);

  const leaderboardUserIds = leaderboardRaw.map((r) => r.referrerId);
  const leaderboardUsers = leaderboardUserIds.length
    ? await db
        .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
        .from(usersTable)
    : [];
  const leaderboardUserMap = Object.fromEntries(leaderboardUsers.map((u) => [u.id, u]));

  const leaderboard = leaderboardRaw.map((row, idx) => ({
    rank: idx + 1,
    userId: row.referrerId,
    name: leaderboardUserMap[row.referrerId]?.name ?? "Unknown",
    email: leaderboardUserMap[row.referrerId]?.email ?? "",
    totalReferrals: row.totalReferrals,
    totalBonusDaysEarned: parseInt(row.totalBonusDaysEarned ?? "0", 10),
  }));

  res.json({
    settings,
    leaderboard,
    referrals: referrals.map((r) => ({
      id: r.id,
      status: r.status,
      referrer: userMap[r.referrerId] ?? { id: r.referrerId, name: "Unknown", email: "" },
      referee: userMap[r.refereeId] ?? { id: r.refereeId, name: "Unknown", email: "" },
      refereeBonusDays: r.refereeBonusDays,
      referrerBonusDays: r.referrerBonusDays,
      createdAt: r.createdAt.toISOString(),
      rewardedAt: r.rewardedAt?.toISOString() ?? null,
    })),
  });
});

router.patch("/admin/referral/settings", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { refereeBonusDays, referrerBonusDays } = req.body as {
      refereeBonusDays?: number;
      referrerBonusDays?: number;
    };

    if (refereeBonusDays != null && (refereeBonusDays < 1 || refereeBonusDays > 365)) {
      res.status(400).json({ error: "refereeBonusDays must be between 1 and 365" });
      return;
    }
    if (referrerBonusDays != null && (referrerBonusDays < 1 || referrerBonusDays > 365)) {
      res.status(400).json({ error: "referrerBonusDays must be between 1 and 365" });
      return;
    }

    await setReferralSettings(refereeBonusDays, referrerBonusDays);
    const settings = await getReferralSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to update referral settings" });
  }
});

export default router;
