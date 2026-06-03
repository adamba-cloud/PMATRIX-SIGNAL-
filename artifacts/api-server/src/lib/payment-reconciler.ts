/**
 * Payment Reconciliation Worker
 *
 * Runs every 5 minutes. Finds PENDING payments that are older than 2 minutes
 * (giving Safaricom time to deliver the callback) and queries the Daraja STK
 * status endpoint to reconcile them.
 *
 * On SUCCESS  → payment COMPLETED, subscription activated
 * On FAILURE  → payment FAILED, subscription CANCELLED
 * On PENDING  → leaves as-is (Safaricom may still deliver callback)
 *
 * All state changes are written to the system audit log.
 */
import { and, eq, lt, isNotNull } from "drizzle-orm";
import { db, paymentsTable, subscriptionsTable } from "@workspace/db";
import { queryStkStatus } from "./daraja";
import { writeAuditLog } from "./audit";
import { logger } from "./logger";
import { broadcastAdminEvent, broadcastSubscriptionActivated } from "./forex-ws";

const RECONCILE_INTERVAL_MS = 5 * 60 * 1_000;
const STALE_AFTER_MS = 2 * 60 * 1_000;


async function reconcilePayment(payment: typeof paymentsTable.$inferSelect): Promise<void> {
  if (!payment.checkoutRequestId) {
    await db
      .update(paymentsTable)
      .set({ status: "FAILED", failureReason: "No checkoutRequestId" })
      .where(eq(paymentsTable.id, payment.id));
    return;
  }

  const result = await queryStkStatus(payment.checkoutRequestId);

  if (!result) {
    logger.warn({ paymentId: payment.id }, "Reconciler: could not query STK status — skipping");
    return;
  }

  const resultCode = parseInt(result.ResultCode ?? result.ResponseCode ?? "1", 10);
  const success = resultCode === 0;

  if (success) {
    await db.transaction(async (tx) => {
      await tx
        .update(paymentsTable)
        .set({ status: "COMPLETED", completedAt: new Date() })
        .where(eq(paymentsTable.id, payment.id));

      if (payment.subscriptionId) {
        const [sub] = await tx
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.id, payment.subscriptionId));

        if (sub && sub.status !== "ACTIVE") {
          const startDate = new Date();
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + (sub.daysSelected ?? 30));

          await tx
            .update(subscriptionsTable)
            .set({ status: "ACTIVE", startDate, endDate, updatedAt: new Date() })
            .where(eq(subscriptionsTable.id, payment.subscriptionId));
        }
      }
    });

    broadcastAdminEvent("payment_completed", {
      paymentId: payment.id,
      amount: payment.amount,
      receipt: null,
    });

    // Broadcast to user's frontend so it can immediately unlock
    if (payment.subscriptionId) {
      const [activatedSub] = await db
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.id, payment.subscriptionId));
      if (activatedSub) {
        broadcastSubscriptionActivated(payment.userId, {
          subscriptionId: activatedSub.id,
          endDate: activatedSub.endDate?.toISOString() ?? null,
          daysSelected: activatedSub.daysSelected,
          receipt: null,
          source: "reconciler",
        });
      }
    }

    logger.info({ paymentId: payment.id }, "Reconciler: payment reconciled as COMPLETED");
    await writeAuditLog("PAYMENT_RECONCILED_SUCCESS", {
      paymentId: payment.id,
      checkoutRequestId: payment.checkoutRequestId,
      subscriptionId: payment.subscriptionId,
    });
  } else {
    await db.transaction(async (tx) => {
      await tx
        .update(paymentsTable)
        .set({ status: "FAILED", failureReason: result.ResultDesc ?? `ResultCode ${resultCode}` })
        .where(eq(paymentsTable.id, payment.id));

      if (payment.subscriptionId) {
        await tx
          .update(subscriptionsTable)
          .set({ status: "CANCELLED", updatedAt: new Date() })
          .where(eq(subscriptionsTable.id, payment.subscriptionId));
      }
    });

    logger.info(
      { paymentId: payment.id, resultCode, resultDesc: result.ResultDesc },
      "Reconciler: payment reconciled as FAILED"
    );
    await writeAuditLog(
      "PAYMENT_RECONCILED_FAILED",
      { paymentId: payment.id, checkoutRequestId: payment.checkoutRequestId, resultCode, resultDesc: result.ResultDesc },
      "WARN"
    );
  }
}

async function runReconcileCycle(): Promise<void> {
  const staleThreshold = new Date(Date.now() - STALE_AFTER_MS);

  const pendingPayments = await db
    .select()
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.status, "PENDING"),
        isNotNull(paymentsTable.checkoutRequestId),
        lt(paymentsTable.createdAt, staleThreshold)
      )
    );

  if (pendingPayments.length === 0) return;

  logger.info({ count: pendingPayments.length }, "Reconciler: reconciling pending payments");

  const results = await Promise.allSettled(
    pendingPayments.map((p) => reconcilePayment(p))
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    logger.warn({ failed, total: pendingPayments.length }, "Reconciler: some reconciliations failed");
  }
}

export function startPaymentReconciler(): void {
  const hasDarajaConfig =
    process.env.DARAJA_CONSUMER_KEY &&
    process.env.DARAJA_CONSUMER_SECRET &&
    process.env.DARAJA_BUSINESS_SHORTCODE &&
    process.env.DARAJA_PASSKEY;

  if (!hasDarajaConfig) {
    logger.warn("Daraja env vars not set — payment reconciler will not start");
    return;
  }

  const tick = async () => {
    try {
      await runReconcileCycle();
    } catch (err) {
      logger.error({ err }, "Reconciler: cycle error");
    }
  };

  // Stagger first run by 1 minute to let server fully initialise
  setTimeout(() => {
    tick();
    setInterval(tick, RECONCILE_INTERVAL_MS);
  }, 60_000);

  logger.info({ intervalMs: RECONCILE_INTERVAL_MS }, "Payment reconciler started");
}
