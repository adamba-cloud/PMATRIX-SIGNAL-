import { db, mt5AccountSubscriptionsTable } from "@workspace/db";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { logger } from "./logger";

export function startMt5SubscriptionExpiryJob(): void {
  const run = async () => {
    try {
      const now = new Date();
      const expired = await db
        .update(mt5AccountSubscriptionsTable)
        .set({ status: "EXPIRED" })
        .where(
          and(
            eq(mt5AccountSubscriptionsTable.status, "ACTIVE"),
            isNotNull(mt5AccountSubscriptionsTable.expiryDate),
            lt(mt5AccountSubscriptionsTable.expiryDate, now)
          )
        )
        .returning({ id: mt5AccountSubscriptionsTable.id, slaveAccountId: mt5AccountSubscriptionsTable.slaveAccountId });

      if (expired.length > 0) {
        logger.info(
          { count: expired.length, accountIds: expired.map((e) => e.slaveAccountId) },
          "MT5 account subscriptions expired"
        );
      }
    } catch (err) {
      logger.error({ err }, "MT5 subscription expiry job failed");
    }
  };

  run();
  const INTERVAL_MS = 60 * 60 * 1000;
  setInterval(run, INTERVAL_MS);
  logger.info({ intervalMs: INTERVAL_MS }, "MT5 subscription expiry job started");
}
