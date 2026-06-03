import { Router } from "express";
import {
  db,
  mt5AccountSubscriptionsTable,
  mt5BillingSettingsTable,
  paymentsTable,
  slaveAccountsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, gt, sql, sum } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { initiateStkPush, formatPhone } from "../lib/daraja";
import { logger } from "../lib/logger";

const router = Router();

async function getSettings() {
  const rows = await db.select().from(mt5BillingSettingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db
    .insert(mt5BillingSettingsTable)
    .values({ feePerAccountPerDay: "50", minimumSubscriptionDays: 7, maximumMt5Accounts: 5 })
    .returning();
  return created;
}

function getCallbackUrl(req: import("express").Request): string {
  const base = process.env["DARAJA_CALLBACK_BASE_URL"];
  if (base) {
    return base.includes("/api/payments/mpesa/callback")
      ? base.trim()
      : `${base.replace(/\/+$/, "").replace(/\/api\/.*/, "")}/api/payments/mpesa/callback`;
  }
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0].trim()}/api/payments/mpesa/callback`;
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) return `https://${devDomain}/api/payments/mpesa/callback`;
  const host = req.get("host") ?? "localhost";
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  return `${proto}://${host}/api/payments/mpesa/callback`;
}

// ─── User: Get billing settings ───────────────────────────────────────────────

router.get("/mt5/billing/settings", requireAuth, async (_req, res): Promise<void> => {
  try {
    const settings = await getSettings();
    res.json({
      feePerAccountPerDay: parseFloat(settings.feePerAccountPerDay),
      minimumSubscriptionDays: settings.minimumSubscriptionDays,
      maximumMt5Accounts: settings.maximumMt5Accounts,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load billing settings" });
  }
});

// ─── User: Get my MT5 subscriptions (latest active per account) ───────────────

router.get("/mt5/billing/subscriptions/mine", requireAuth, async (req, res): Promise<void> => {
  try {
    const subs = await db
      .select({
        id: mt5AccountSubscriptionsTable.id,
        slaveAccountId: mt5AccountSubscriptionsTable.slaveAccountId,
        numberOfDays: mt5AccountSubscriptionsTable.numberOfDays,
        feePerAccountPerDay: mt5AccountSubscriptionsTable.feePerAccountPerDay,
        amount: mt5AccountSubscriptionsTable.amount,
        startDate: mt5AccountSubscriptionsTable.startDate,
        expiryDate: mt5AccountSubscriptionsTable.expiryDate,
        status: mt5AccountSubscriptionsTable.status,
        createdAt: mt5AccountSubscriptionsTable.createdAt,
        mt5Login: slaveAccountsTable.mt5Login,
        brokerServer: slaveAccountsTable.brokerServer,
      })
      .from(mt5AccountSubscriptionsTable)
      .innerJoin(slaveAccountsTable, eq(mt5AccountSubscriptionsTable.slaveAccountId, slaveAccountsTable.id))
      .where(eq(mt5AccountSubscriptionsTable.userId, req.userId!))
      .orderBy(desc(mt5AccountSubscriptionsTable.createdAt));

    res.json(subs.map((s) => ({
      ...s,
      feePerAccountPerDay: parseFloat(s.feePerAccountPerDay),
      amount: parseFloat(s.amount),
      startDate: s.startDate?.toISOString() ?? null,
      expiryDate: s.expiryDate?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      daysRemaining: s.expiryDate && s.status === "ACTIVE"
        ? Math.max(0, Math.ceil((s.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0,
    })));
  } catch (err) {
    res.status(500).json({ error: "Failed to load subscriptions" });
  }
});

// ─── User: Check active subscription for one account ─────────────────────────

router.get("/mt5/billing/subscriptions/:slaveAccountId/active", requireAuth, async (req, res): Promise<void> => {
  try {
    const slaveAccountId = parseInt(req.params.slaveAccountId, 10);
    if (isNaN(slaveAccountId)) { res.status(400).json({ error: "Invalid account ID" }); return; }

    const now = new Date();
    const [sub] = await db
      .select()
      .from(mt5AccountSubscriptionsTable)
      .where(
        and(
          eq(mt5AccountSubscriptionsTable.userId, req.userId!),
          eq(mt5AccountSubscriptionsTable.slaveAccountId, slaveAccountId),
          eq(mt5AccountSubscriptionsTable.status, "ACTIVE"),
          gt(mt5AccountSubscriptionsTable.expiryDate, now)
        )
      )
      .orderBy(desc(mt5AccountSubscriptionsTable.expiryDate))
      .limit(1);

    res.json({ hasActive: !!sub, subscription: sub ?? null });
  } catch (err) {
    res.status(500).json({ error: "Failed to check subscription" });
  }
});

// ─── User: Initiate MT5 subscription payment (STK Push) ──────────────────────

router.post("/mt5/billing/pay", requireAuth, async (req, res): Promise<void> => {
  try {
    const { phoneNumber, slaveAccountIds, numberOfDays } = req.body as {
      phoneNumber?: string;
      slaveAccountIds?: number[];
      numberOfDays?: number;
    };

    if (!phoneNumber || !slaveAccountIds?.length || !numberOfDays) {
      res.status(400).json({ error: "phoneNumber, slaveAccountIds, and numberOfDays are required" });
      return;
    }

    let formattedPhone: string;
    try {
      formattedPhone = formatPhone(phoneNumber);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Invalid phone number" });
      return;
    }

    const settings = await getSettings();
    if (numberOfDays < settings.minimumSubscriptionDays) {
      res.status(400).json({ error: `Minimum subscription is ${settings.minimumSubscriptionDays} days` });
      return;
    }

    const myAccounts = await db
      .select()
      .from(slaveAccountsTable)
      .where(eq(slaveAccountsTable.userId, req.userId!));
    const myAccountIds = new Set(myAccounts.map((a) => a.id));

    for (const id of slaveAccountIds) {
      if (!myAccountIds.has(id)) {
        res.status(403).json({ error: `Account ${id} does not belong to you` });
        return;
      }
    }

    const feePerAccountPerDay = parseFloat(settings.feePerAccountPerDay);
    const numAccounts = slaveAccountIds.length;
    const totalAmount = feePerAccountPerDay * numAccounts * numberOfDays;
    const amountStr = totalAmount.toFixed(2);
    const amountPerSub = (feePerAccountPerDay * numberOfDays).toFixed(2);

    const pendingSubs = await db
      .insert(mt5AccountSubscriptionsTable)
      .values(
        slaveAccountIds.map((slaveAccountId) => ({
          userId: req.userId!,
          slaveAccountId,
          numberOfDays,
          feePerAccountPerDay: settings.feePerAccountPerDay,
          amount: amountPerSub,
          status: "PENDING" as const,
        }))
      )
      .returning();

    const subIds = pendingSubs.map((s) => s.id);

    const [payment] = await db
      .insert(paymentsTable)
      .values({
        userId: req.userId!,
        amount: amountStr,
        status: "PENDING",
        method: "MPESA",
        phoneNumber: formattedPhone,
        reference: `MT5-SUBS:${subIds.join(",")}`,
      })
      .returning();

    await db
      .update(mt5AccountSubscriptionsTable)
      .set({ paymentId: payment.id })
      .where(
        sql`${mt5AccountSubscriptionsTable.id} = ANY(ARRAY[${sql.join(subIds.map((id) => sql`${id}`), sql`, `)}]::int[])`
      );

    let stkResult: Awaited<ReturnType<typeof initiateStkPush>>;
    try {
      stkResult = await initiateStkPush({
        phoneNumber: formattedPhone,
        amount: totalAmount,
        accountReference: `MT5-${payment.id}`,
        transactionDesc: `PESAMATRIX MT5 ${numAccounts} acct(s) × ${numberOfDays}d`,
        callbackUrl: getCallbackUrl(req),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "STK Push failed";
      logger.error({ err, paymentId: payment.id }, "MT5 billing STK Push failed");
      await db.update(paymentsTable).set({ status: "FAILED", failureReason: msg }).where(eq(paymentsTable.id, payment.id));
      await db
        .update(mt5AccountSubscriptionsTable)
        .set({ status: "EXPIRED" })
        .where(
          sql`${mt5AccountSubscriptionsTable.id} = ANY(ARRAY[${sql.join(subIds.map((id) => sql`${id}`), sql`, `)}]::int[])`
        );
      res.status(502).json({ error: msg });
      return;
    }

    await db
      .update(paymentsTable)
      .set({ checkoutRequestId: stkResult.CheckoutRequestID, merchantRequestId: stkResult.MerchantRequestID })
      .where(eq(paymentsTable.id, payment.id));

    res.json({
      checkoutRequestId: stkResult.CheckoutRequestID,
      merchantRequestId: stkResult.MerchantRequestID,
      paymentId: payment.id,
      message: stkResult.CustomerMessage,
      totalAmount,
      numAccounts,
      numberOfDays,
    });
  } catch (err) {
    logger.error({ err }, "MT5 billing pay error");
    res.status(500).json({ error: "Failed to initiate payment" });
  }
});

// ─── Admin: Get settings ──────────────────────────────────────────────────────

router.get("/admin/mt5/billing/settings", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// ─── Admin: Update settings ───────────────────────────────────────────────────

router.patch("/admin/mt5/billing/settings", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { feePerAccountPerDay, minimumSubscriptionDays, maximumMt5Accounts } = req.body as {
      feePerAccountPerDay?: number;
      minimumSubscriptionDays?: number;
      maximumMt5Accounts?: number;
    };

    const existing = await db.select().from(mt5BillingSettingsTable).limit(1);
    const now = new Date();
    const updates: Partial<typeof mt5BillingSettingsTable.$inferInsert> & { updatedAt: Date } = { updatedAt: now };

    if (feePerAccountPerDay != null) updates.feePerAccountPerDay = String(feePerAccountPerDay);
    if (minimumSubscriptionDays != null) updates.minimumSubscriptionDays = minimumSubscriptionDays;
    if (maximumMt5Accounts != null) updates.maximumMt5Accounts = maximumMt5Accounts;

    let settings;
    if (existing.length > 0) {
      const [updated] = await db
        .update(mt5BillingSettingsTable)
        .set(updates)
        .where(eq(mt5BillingSettingsTable.id, existing[0].id))
        .returning();
      settings = updated;
    } else {
      const [created] = await db.insert(mt5BillingSettingsTable).values(updates).returning();
      settings = created;
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// ─── Admin: List all MT5 subscriptions ───────────────────────────────────────

router.get("/admin/mt5/billing/subscriptions", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const subs = await db
      .select({
        id: mt5AccountSubscriptionsTable.id,
        userId: mt5AccountSubscriptionsTable.userId,
        slaveAccountId: mt5AccountSubscriptionsTable.slaveAccountId,
        numberOfDays: mt5AccountSubscriptionsTable.numberOfDays,
        feePerAccountPerDay: mt5AccountSubscriptionsTable.feePerAccountPerDay,
        amount: mt5AccountSubscriptionsTable.amount,
        startDate: mt5AccountSubscriptionsTable.startDate,
        expiryDate: mt5AccountSubscriptionsTable.expiryDate,
        status: mt5AccountSubscriptionsTable.status,
        createdAt: mt5AccountSubscriptionsTable.createdAt,
        mt5Login: slaveAccountsTable.mt5Login,
        brokerServer: slaveAccountsTable.brokerServer,
        userName: usersTable.name,
        userEmail: usersTable.email,
      })
      .from(mt5AccountSubscriptionsTable)
      .innerJoin(slaveAccountsTable, eq(mt5AccountSubscriptionsTable.slaveAccountId, slaveAccountsTable.id))
      .innerJoin(usersTable, eq(mt5AccountSubscriptionsTable.userId, usersTable.id))
      .orderBy(desc(mt5AccountSubscriptionsTable.createdAt));

    res.json(subs.map((s) => ({
      ...s,
      feePerAccountPerDay: parseFloat(s.feePerAccountPerDay),
      amount: parseFloat(s.amount),
      startDate: s.startDate?.toISOString() ?? null,
      expiryDate: s.expiryDate?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      daysRemaining: s.expiryDate && s.status === "ACTIVE"
        ? Math.max(0, Math.ceil((s.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0,
    })));
  } catch (err) {
    res.status(500).json({ error: "Failed to load subscriptions" });
  }
});

// ─── Admin: Analytics ────────────────────────────────────────────────────────

router.get("/admin/mt5/billing/analytics", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const now = new Date();

    const [activeCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mt5AccountSubscriptionsTable)
      .where(and(eq(mt5AccountSubscriptionsTable.status, "ACTIVE"), gt(mt5AccountSubscriptionsTable.expiryDate, now)));

    const [expiredCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mt5AccountSubscriptionsTable)
      .where(eq(mt5AccountSubscriptionsTable.status, "EXPIRED"));

    const [totalRevenue] = await db
      .select({ total: sum(mt5AccountSubscriptionsTable.amount) })
      .from(mt5AccountSubscriptionsTable)
      .where(eq(mt5AccountSubscriptionsTable.status, "ACTIVE"));

    const revenueByPeriod = await db
      .select({
        numberOfDays: mt5AccountSubscriptionsTable.numberOfDays,
        count: sql<number>`count(*)::int`,
        revenue: sum(mt5AccountSubscriptionsTable.amount),
      })
      .from(mt5AccountSubscriptionsTable)
      .where(eq(mt5AccountSubscriptionsTable.status, "ACTIVE"))
      .groupBy(mt5AccountSubscriptionsTable.numberOfDays)
      .orderBy(mt5AccountSubscriptionsTable.numberOfDays);

    res.json({
      activeAccounts: activeCount?.count ?? 0,
      expiredAccounts: expiredCount?.count ?? 0,
      totalRevenue: parseFloat(totalRevenue?.total ?? "0"),
      revenueByPeriod: revenueByPeriod.map((r) => ({
        numberOfDays: r.numberOfDays,
        count: r.count,
        revenue: parseFloat(r.revenue ?? "0"),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

// ─── Admin: Grant subscription ────────────────────────────────────────────────

router.post("/admin/mt5/billing/grant", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { slaveAccountId, numberOfDays } = req.body as {
      slaveAccountId?: number;
      numberOfDays?: number;
    };

    if (!slaveAccountId || !numberOfDays) {
      res.status(400).json({ error: "slaveAccountId and numberOfDays are required" });
      return;
    }

    const [account] = await db.select().from(slaveAccountsTable).where(eq(slaveAccountsTable.id, slaveAccountId));
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }

    const settings = await getSettings();
    const now = new Date();
    const expiryDate = new Date(now.getTime() + numberOfDays * 24 * 60 * 60 * 1000);

    const [sub] = await db
      .insert(mt5AccountSubscriptionsTable)
      .values({
        userId: account.userId,
        slaveAccountId,
        numberOfDays,
        feePerAccountPerDay: settings.feePerAccountPerDay,
        amount: "0.00",
        status: "ACTIVE",
        startDate: now,
        expiryDate,
      })
      .returning();

    res.status(201).json(sub);
  } catch (err) {
    res.status(500).json({ error: "Failed to grant subscription" });
  }
});

export default router;
