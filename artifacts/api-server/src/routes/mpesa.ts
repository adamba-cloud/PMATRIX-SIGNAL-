import { Router } from "express";
import { broadcastAdminEvent, broadcastSubscriptionActivated } from "../lib/forex-ws";
import { db, paymentsTable, subscriptionsTable, systemConfigTable, advertisementsTable, mt5AccountSubscriptionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { initiateStkPush, parseCallback, formatPhone, queryStkStatus, type DarajaCallbackBody } from "../lib/daraja";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

function getCallbackUrl(req: import("express").Request): string {
  const base = process.env["DARAJA_CALLBACK_BASE_URL"];
  if (base) {
    const url = base.includes("/api/payments/mpesa/callback")
      ? base.trim()
      : `${base.replace(/\/+$/, "").replace(/\/api\/.*/,"")}/api/payments/mpesa/callback`;
    logger.info({ callbackUrl: url, source: "DARAJA_CALLBACK_BASE_URL" }, "[MPESA] Using callback URL");
    return url;
  }

  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    const domain = domains.split(",")[0].trim();
    const url = `https://${domain}/api/payments/mpesa/callback`;
    logger.info({ callbackUrl: url, source: "REPLIT_DOMAINS" }, "[MPESA] Using callback URL");
    return url;
  }

  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) {
    const url = `https://${devDomain}/api/payments/mpesa/callback`;
    logger.info({ callbackUrl: url, source: "REPLIT_DEV_DOMAIN" }, "[MPESA] Using callback URL");
    return url;
  }

  const host = req.get("host") ?? "localhost";
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  const url = `${proto}://${host}/api/payments/mpesa/callback`;
  logger.warn({ callbackUrl: url, source: "request-headers" }, "[MPESA] Callback URL derived from headers — set DARAJA_CALLBACK_BASE_URL for reliability");
  return url;
}

async function getSystemConfig(): Promise<{ feePerDay: number; minDays: number }> {
  const rows = await db.select().from(systemConfigTable);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    feePerDay: parseFloat(map["feePerDay"] ?? "150"),
    minDays: parseInt(map["minDays"] ?? "7", 10),
  };
}

/**
 * Activate a completed payment and its linked subscription.
 * Returns the activated subscription or null if no subscription was linked.
 */
async function activatePayment(
  payment: typeof paymentsTable.$inferSelect,
  receiptNumber: string | null,
): Promise<typeof subscriptionsTable.$inferSelect | null> {
  const now = new Date();

  await db
    .update(paymentsTable)
    .set({ status: "COMPLETED", mpesaReceiptNumber: receiptNumber, reference: receiptNumber, completedAt: now })
    .where(eq(paymentsTable.id, payment.id));

  logger.info(
    { paymentId: payment.id, receipt: receiptNumber, ts: now.toISOString() },
    "[MPESA] Payment marked COMPLETED",
  );

  let activatedSub: typeof subscriptionsTable.$inferSelect | null = null;

  if (payment.subscriptionId) {
    const [sub] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.id, payment.subscriptionId));

    if (sub && sub.status !== "ACTIVE") {
      const endDate = new Date(now.getTime() + sub.daysSelected * 24 * 60 * 60 * 1000);

      const [updated] = await db
        .update(subscriptionsTable)
        .set({ status: "ACTIVE", startDate: now, endDate })
        .where(eq(subscriptionsTable.id, sub.id))
        .returning();

      activatedSub = updated;

      logger.info(
        {
          subscriptionId: sub.id,
          userId: sub.userId,
          daysSelected: sub.daysSelected,
          startDate: now.toISOString(),
          endDate: endDate.toISOString(),
          ts: new Date().toISOString(),
        },
        "[MPESA] Subscription ACTIVATED",
      );
    } else if (sub?.status === "ACTIVE") {
      activatedSub = sub;
      logger.info({ subscriptionId: sub.id }, "[MPESA] Subscription was already ACTIVE");
    }
  }

  return activatedSub;
}

// ─── STK Push ─────────────────────────────────────────────────────────────────

router.post("/payments/mpesa/stk", requireAuth, async (req, res): Promise<void> => {
  const t0 = Date.now();
  const { phoneNumber, daysSelected } = req.body as {
    phoneNumber?: string;
    daysSelected?: number;
  };

  logger.info(
    { userId: req.userId, phoneNumber, daysSelected, ts: new Date().toISOString() },
    "[MPESA] STK Push requested",
  );

  if (!phoneNumber || !daysSelected) {
    res.status(400).json({ error: "phoneNumber and daysSelected are required" });
    return;
  }

  let formattedPhone: string;
  try {
    formattedPhone = formatPhone(String(phoneNumber));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid phone number";
    res.status(400).json({ error: msg });
    return;
  }

  const config = await getSystemConfig();

  if (daysSelected < config.minDays) {
    res.status(400).json({ error: `Minimum subscription is ${config.minDays} days` });
    return;
  }

  const totalAmount = config.feePerDay * daysSelected;

  const [subscription] = await db
    .insert(subscriptionsTable)
    .values({
      userId: req.userId!,
      status: "PENDING",
      daysSelected,
      totalAmount: totalAmount.toFixed(2),
      feePerDay: config.feePerDay.toFixed(2),
      phoneNumber: formattedPhone,
    })
    .returning();

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      userId: req.userId!,
      subscriptionId: subscription.id,
      amount: totalAmount.toFixed(2),
      status: "PENDING",
      method: "MPESA",
      phoneNumber: formattedPhone,
    })
    .returning();

  const callbackUrl = getCallbackUrl(req);

  logger.info(
    {
      userId: req.userId,
      paymentId: payment.id,
      subscriptionId: subscription.id,
      amount: totalAmount,
      phone: formattedPhone,
      callbackUrl,
      ts: new Date().toISOString(),
    },
    "[MPESA] Initiating STK Push",
  );

  let stkResult: Awaited<ReturnType<typeof initiateStkPush>>;
  try {
    stkResult = await initiateStkPush({
      phoneNumber: formattedPhone,
      amount: totalAmount,
      accountReference: `PESA-${subscription.id}`,
      transactionDesc: `PESAMATRIX ${daysSelected} day subscription`,
      callbackUrl,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "STK Push failed";
    logger.error({ err, paymentId: payment.id, elapsedMs: Date.now() - t0 }, "[MPESA] STK Push initiation FAILED");
    await db
      .update(paymentsTable)
      .set({ status: "FAILED", failureReason: msg })
      .where(eq(paymentsTable.id, payment.id));
    await db
      .update(subscriptionsTable)
      .set({ status: "CANCELLED" })
      .where(eq(subscriptionsTable.id, subscription.id));
    res.status(502).json({ error: msg });
    return;
  }

  await db
    .update(paymentsTable)
    .set({
      checkoutRequestId: stkResult.CheckoutRequestID,
      merchantRequestId: stkResult.MerchantRequestID,
    })
    .where(eq(paymentsTable.id, payment.id));

  logger.info(
    {
      paymentId: payment.id,
      checkoutRequestId: stkResult.CheckoutRequestID,
      elapsedMs: Date.now() - t0,
      ts: new Date().toISOString(),
    },
    "[MPESA] STK Push sent — waiting for callback",
  );

  res.json({
    checkoutRequestId: stkResult.CheckoutRequestID,
    merchantRequestId: stkResult.MerchantRequestID,
    paymentId: payment.id,
    message: stkResult.CustomerMessage,
  });
});

// ─── Daraja Callback ──────────────────────────────────────────────────────────

router.post("/payments/mpesa/callback", async (req, res): Promise<void> => {
  const t0 = Date.now();
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    const body = req.body as DarajaCallbackBody;
    const parsed = parseCallback(body);

    logger.info(
      {
        checkoutRequestId: parsed.checkoutRequestId,
        resultCode: parsed.resultCode,
        resultDesc: parsed.resultDesc,
        receipt: parsed.mpesaReceiptNumber,
        ts: new Date().toISOString(),
      },
      "[MPESA] Callback received",
    );

    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.checkoutRequestId, parsed.checkoutRequestId));

    if (!payment) {
      logger.warn({ checkoutRequestId: parsed.checkoutRequestId }, "[MPESA] Callback — no matching payment found");
      return;
    }

    if (payment.status === "COMPLETED") {
      logger.info({ paymentId: payment.id }, "[MPESA] Callback — payment already COMPLETED, skipping");
      return;
    }

    logger.info(
      { paymentId: payment.id, subscriptionId: payment.subscriptionId, ts: new Date().toISOString() },
      "[MPESA] Callback — processing payment",
    );

    if (parsed.resultCode === 0) {
      const activatedSub = await activatePayment(payment, parsed.mpesaReceiptNumber);

      if (activatedSub) {
        broadcastSubscriptionActivated(payment.userId, {
          subscriptionId: activatedSub.id,
          endDate: activatedSub.endDate?.toISOString() ?? null,
          daysSelected: activatedSub.daysSelected,
          receipt: parsed.mpesaReceiptNumber,
          source: "callback",
        });
      }

      // Activate MT5 subscriptions linked to this payment
      const pendingMt5Subs = await db
        .select()
        .from(mt5AccountSubscriptionsTable)
        .where(and(eq(mt5AccountSubscriptionsTable.paymentId, payment.id), eq(mt5AccountSubscriptionsTable.status, "PENDING")));

      if (pendingMt5Subs.length > 0) {
        const now = new Date();
        for (const sub of pendingMt5Subs) {
          const expiryDate = new Date(now.getTime() + sub.numberOfDays * 24 * 60 * 60 * 1000);
          await db
            .update(mt5AccountSubscriptionsTable)
            .set({ status: "ACTIVE", startDate: now, expiryDate })
            .where(eq(mt5AccountSubscriptionsTable.id, sub.id));
        }
        logger.info({ paymentId: payment.id, count: pendingMt5Subs.length }, "[MPESA] MT5 subscriptions activated");
      }

      // Activate advertisement if linked
      if (payment.advertisementId) {
        await db
          .update(advertisementsTable)
          .set({ isPaid: true, updatedAt: new Date() })
          .where(eq(advertisementsTable.id, payment.advertisementId));
        logger.info({ advertisementId: payment.advertisementId }, "[MPESA] Advertisement marked as paid");
      }

      broadcastAdminEvent("payment_completed", {
        paymentId: payment.id,
        amount: payment.amount,
        receipt: parsed.mpesaReceiptNumber ?? null,
      });

      logger.info(
        { paymentId: payment.id, elapsedMs: Date.now() - t0, ts: new Date().toISOString() },
        "[MPESA] Callback processing COMPLETE",
      );
    } else {
      await db
        .update(paymentsTable)
        .set({ status: "FAILED", failureReason: parsed.resultDesc })
        .where(eq(paymentsTable.id, payment.id));

      if (payment.subscriptionId) {
        await db
          .update(subscriptionsTable)
          .set({ status: "CANCELLED" })
          .where(eq(subscriptionsTable.id, payment.subscriptionId));
      }

      logger.info(
        { paymentId: payment.id, resultCode: parsed.resultCode, reason: parsed.resultDesc },
        "[MPESA] Payment FAILED via callback",
      );
    }
  } catch (err) {
    logger.error({ err, elapsedMs: Date.now() - t0 }, "[MPESA] Error processing callback");
  }
});

// ─── Payment Status Poll ───────────────────────────────────────────────────────

router.get("/payments/mpesa/status/:checkoutRequestId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.checkoutRequestId)
    ? req.params.checkoutRequestId[0]
    : req.params.checkoutRequestId;

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.checkoutRequestId, raw));

  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  let subscription = null;
  if (payment.subscriptionId && payment.status === "COMPLETED") {
    const [sub] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.id, payment.subscriptionId));
    if (sub) {
      subscription = {
        id: sub.id,
        userId: sub.userId,
        status: sub.status,
        daysSelected: sub.daysSelected,
        totalAmount: parseFloat(sub.totalAmount),
        feePerDay: parseFloat(sub.feePerDay),
        phoneNumber: sub.phoneNumber ?? null,
        startDate: sub.startDate?.toISOString() ?? null,
        endDate: sub.endDate?.toISOString() ?? null,
        createdAt: sub.createdAt.toISOString(),
      };
    }
  }

  res.json({
    status: payment.status,
    paymentId: payment.id,
    mpesaReceiptNumber: payment.mpesaReceiptNumber ?? null,
    failureReason: payment.failureReason ?? null,
    subscription,
  });
});

// ─── Force Verification (60-second fallback) ──────────────────────────────────

router.post("/payments/mpesa/verify/:checkoutRequestId", requireAuth, async (req, res): Promise<void> => {
  const t0 = Date.now();
  const checkoutRequestId = Array.isArray(req.params.checkoutRequestId)
    ? req.params.checkoutRequestId[0]
    : req.params.checkoutRequestId;

  logger.info(
    { checkoutRequestId, userId: req.userId, ts: new Date().toISOString() },
    "[MPESA] Manual verification triggered (60-second fallback)",
  );

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.checkoutRequestId, checkoutRequestId));

  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  if (payment.userId !== req.userId && req.userRole !== "ADMIN") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Already completed — just return current status
  if (payment.status === "COMPLETED") {
    logger.info({ paymentId: payment.id }, "[MPESA] Verify — payment already COMPLETED");
    res.json({ status: "COMPLETED", paymentId: payment.id, alreadyCompleted: true });
    return;
  }

  if (payment.status === "FAILED") {
    res.json({ status: "FAILED", paymentId: payment.id, failureReason: payment.failureReason });
    return;
  }

  // Query Daraja for real-time status
  const stkResult = await queryStkStatus(checkoutRequestId);

  if (!stkResult) {
    logger.warn({ checkoutRequestId, elapsedMs: Date.now() - t0 }, "[MPESA] Verify — Daraja query returned null");
    res.json({ status: payment.status, paymentId: payment.id, verified: false, reason: "Daraja query failed" });
    return;
  }

  const resultCode = parseInt(stkResult.ResultCode ?? stkResult.ResponseCode ?? "1", 10);

  logger.info(
    { checkoutRequestId, resultCode, ResultDesc: stkResult.ResultDesc, elapsedMs: Date.now() - t0 },
    "[MPESA] Verify — Daraja responded",
  );

  if (resultCode === 0) {
    // Payment successful — activate everything
    const activatedSub = await activatePayment(payment, null);

    if (activatedSub) {
      broadcastSubscriptionActivated(payment.userId, {
        subscriptionId: activatedSub.id,
        endDate: activatedSub.endDate?.toISOString() ?? null,
        daysSelected: activatedSub.daysSelected,
        receipt: null,
        source: "verify",
      });
    }

    broadcastAdminEvent("payment_completed", {
      paymentId: payment.id,
      amount: payment.amount,
      receipt: null,
    });

    logger.info(
      { paymentId: payment.id, subscriptionId: activatedSub?.id, elapsedMs: Date.now() - t0 },
      "[MPESA] Verify — payment ACTIVATED",
    );

    res.json({ status: "COMPLETED", paymentId: payment.id, verified: true, subscriptionActivated: !!activatedSub });
  } else if (resultCode === 1032 || resultCode === 1037) {
    // User cancelled (1032) or timed out (1037)
    await db
      .update(paymentsTable)
      .set({ status: "FAILED", failureReason: stkResult.ResultDesc ?? "Transaction cancelled" })
      .where(eq(paymentsTable.id, payment.id));

    if (payment.subscriptionId) {
      await db
        .update(subscriptionsTable)
        .set({ status: "CANCELLED" })
        .where(eq(subscriptionsTable.id, payment.subscriptionId));
    }

    logger.info({ paymentId: payment.id, resultCode }, "[MPESA] Verify — payment cancelled by user");
    res.json({ status: "FAILED", paymentId: payment.id, verified: true, failureReason: stkResult.ResultDesc });
  } else {
    // Still pending or unknown result
    logger.info(
      { paymentId: payment.id, resultCode, ResultDesc: stkResult.ResultDesc },
      "[MPESA] Verify — payment still PENDING",
    );
    res.json({ status: "PENDING", paymentId: payment.id, verified: true, resultCode, reason: stkResult.ResultDesc });
  }
});

export default router;
