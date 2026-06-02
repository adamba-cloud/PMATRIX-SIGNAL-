import { and, eq, lt, isNotNull } from "drizzle-orm";
import { db, advertisementsTable } from "@workspace/db";
import { logger } from "./logger";

async function expireAdvertisements(): Promise<void> {
  const now = new Date();
  try {
    const expired = await db
      .update(advertisementsTable)
      .set({ status: "EXPIRED", updatedAt: now })
      .where(
        and(
          eq(advertisementsTable.status, "APPROVED"),
          isNotNull(advertisementsTable.endDate),
          lt(advertisementsTable.endDate, now)
        )
      )
      .returning({ id: advertisementsTable.id });

    if (expired.length > 0) {
      logger.info({ count: expired.length, ids: expired.map((a) => a.id) }, "Advertisements expired");
    } else {
      logger.debug("Ad expiry check: no advertisements to expire");
    }
  } catch (err) {
    logger.error({ err }, "Advertisement expiry job failed");
  }
}

const INTERVAL_MS = 24 * 60 * 60 * 1000;

export function startAdvertisementExpiryJob(): void {
  expireAdvertisements();
  setInterval(expireAdvertisements, INTERVAL_MS);
  logger.info({ intervalMs: INTERVAL_MS }, "Advertisement expiry job started");
}
