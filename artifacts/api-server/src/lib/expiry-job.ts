import { and, eq, lt, isNotNull } from "drizzle-orm";
import { db, subscriptionsTable } from "@workspace/db";
import { logger } from "./logger";

async function expireSubscriptions(): Promise<void> {
  const now = new Date();
  try {
    const expired = await db
      .update(subscriptionsTable)
      .set({ status: "EXPIRED" })
      .where(
        and(
          eq(subscriptionsTable.status, "ACTIVE"),
          isNotNull(subscriptionsTable.endDate),
          lt(subscriptionsTable.endDate, now)
        )
      )
      .returning({ id: subscriptionsTable.id });

    if (expired.length > 0) {
      logger.info({ count: expired.length, ids: expired.map((s) => s.id) }, "Subscriptions expired");
    } else {
      logger.debug("Expiry check: no subscriptions to expire");
    }
  } catch (err) {
    logger.error({ err }, "Subscription expiry job failed");
  }
}

const INTERVAL_MS = 60 * 60 * 1000;

export function startExpiryJob(): void {
  expireSubscriptions();
  setInterval(expireSubscriptions, INTERVAL_MS);
  logger.info({ intervalMs: INTERVAL_MS }, "Subscription expiry job started");
}
