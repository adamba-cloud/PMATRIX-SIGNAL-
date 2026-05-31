import { Router } from "express";
import { db, paymentsTable, subscriptionsTable, systemConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { initiateStkPush, parseCallback, formatPhone, type DarajaCallbackBody } from "../lib/daraja";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

function getCallbackUrl(req: import("express").Request): string {
  // 1. Explicit override — highest priority
  const base = process.env["DARAJA_CALLBACK_BASE_URL"];
  if (base) {
    // If the value already contains the callback path, use it as-is
    const url = base.includes("/api/payments/mpesa/callback")
      ? base.trim()
      : `${base.replace(/\/+$/, "").replace(/\/api\/.*/,"")}/api/payments/mpesa/callback`;
    logger.info({ callbackUrl: url, source: "DARAJA_CALLBACK_BASE_URL" }, "Using callback URL");
    return url;
  }

  // 2. Replit managed production domains
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    const domain = domains.split(",")[0].trim();
    const url = `https://${domain}/api/payments/mpesa/callback`;
    logger.info({ callbackUrl: url, source: "REPLIT_DOMAINS" }, "Using callback URL");
    return url;
  }

  // 3. Replit dev domain
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) {
    const url = `https://${devDomain}/api/payments/mpesa/callback`;
    logger.info({ callbackUrl: url, source: "REPLIT_DEV_DOMAIN" }, "Using callback URL");
    return url;
  }

  // 4. Derive from request headers (last resort)
  const host = req.get("host") ?? "localhost";
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  const url = `${proto}://${host}/api/payments/mpesa/callback`;
  logger.warn({ callbackUrl: url, source: "request-headers" }, "Using callback URL derived from headers — set DARAJA_CALLBACK_BASE_URL for reliability");
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

router.post("/payments/mpesa/stk", requireAuth, async (req, res): Promise<void> => {
  const { phoneNumber, daysSelected } = req.body as {
    phoneNumber?: string;
    daysSelected?: number;
  };

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

  let stkResult: Awaited<ReturnType<typeof initiateStkPush>>;
  try {
    stkResult = await initiateStkPush({
      phoneNumber: formattedPhone,
      amount: totalAmount,
      accountReference: `PESA-${subscription.id}`,
      transactionDesc: `PESAMATRIX ${daysSelected} day subscription`,
      callbackUrl: getCallbackUrl(req),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "STK Push failed";
    logger.error({ err, paymentId: payment.id }, "STK Push initiation failed");
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

  res.json({
    checkoutRequestId: stkResult.CheckoutRequestID,
    merchantRequestId: stkResult.MerchantRequestID,
    paymentId: payment.id,
    message: stkResult.CustomerMessage,
  });
});

router.post("/payments/mpesa/callback", async (req, res): Promise<void> => {
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    const body = req.body as DarajaCallbackBody;
    const parsed = parseCallback(body);

    logger.info(
      { checkoutRequestId: parsed.checkoutRequestId, resultCode: parsed.resultCode },
      "Daraja callback received"
    );

    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.checkoutRequestId, parsed.checkoutRequestId));

    if (!payment) {
      logger.warn({ checkoutRequestId: parsed.checkoutRequestId }, "No payment found for callback");
      return;
    }

    if (parsed.resultCode === 0) {
      await db
        .update(paymentsTable)
        .set({
          status: "COMPLETED",
          mpesaReceiptNumber: parsed.mpesaReceiptNumber,
          reference: parsed.mpesaReceiptNumber,
          completedAt: new Date(),
        })
        .where(eq(paymentsTable.id, payment.id));

      if (payment.subscriptionId) {
        const now = new Date();
        const [sub] = await db
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.id, payment.subscriptionId));

        if (sub) {
          const endDate = new Date(now.getTime() + sub.daysSelected * 24 * 60 * 60 * 1000);
          await db
            .update(subscriptionsTable)
            .set({ status: "ACTIVE", startDate: now, endDate })
            .where(eq(subscriptionsTable.id, payment.subscriptionId));
        }
      }

      logger.info({ paymentId: payment.id, receipt: parsed.mpesaReceiptNumber }, "Payment completed");
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

      logger.info({ paymentId: payment.id, reason: parsed.resultDesc }, "Payment failed via callback");
    }
  } catch (err) {
    logger.error({ err }, "Error processing Daraja callback");
  }
});

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

export default router;
