import { and, eq, isNotNull } from "drizzle-orm";
import { db, slaveAccountsTable } from "@workspace/db";
import { logger } from "./logger";
import { getMetaApiAccount, mapMetaApiStatus } from "./metaapi";

const INTERVAL_MS = 15 * 1000;

async function syncMetaApiStatuses(): Promise<void> {
  if (!process.env.METAAPI_TOKEN) return;

  let syncing: (typeof slaveAccountsTable.$inferSelect)[];
  try {
    syncing = await db
      .select()
      .from(slaveAccountsTable)
      .where(
        and(
          eq(slaveAccountsTable.status, "SYNCING"),
          isNotNull(slaveAccountsTable.metaApiAccountId)
        )
      );
  } catch (err) {
    logger.error({ err }, "MetaApi sync: failed to query SYNCING accounts");
    return;
  }

  if (syncing.length === 0) return;

  logger.debug({ count: syncing.length }, "MetaApi sync: checking SYNCING accounts");

  await Promise.allSettled(
    syncing.map(async (account) => {
      try {
        const state = await getMetaApiAccount(account.metaApiAccountId!);
        const { status, message } = mapMetaApiStatus(state);

        const needsUpdate =
          account.status !== status || account.statusMessage !== message;

        if (needsUpdate) {
          await db
            .update(slaveAccountsTable)
            .set({
              status,
              statusMessage: message,
              lastSyncAt: status === "CONNECTED" ? new Date() : account.lastSyncAt,
              updatedAt: new Date(),
            })
            .where(eq(slaveAccountsTable.id, account.id));

          logger.info(
            { accountId: account.id, metaApiId: account.metaApiAccountId, status },
            "MetaApi sync: status updated"
          );
        }
      } catch (err) {
        logger.warn(
          { err, accountId: account.id, metaApiId: account.metaApiAccountId },
          "MetaApi sync: failed to fetch status for account"
        );
        await db
          .update(slaveAccountsTable)
          .set({ status: "ERROR", statusMessage: "Failed to reach MetaApi. Will retry.", updatedAt: new Date() })
          .where(eq(slaveAccountsTable.id, account.id));
      }
    })
  );
}

export function startMetaApiSyncJob(): void {
  if (!process.env.METAAPI_TOKEN) {
    logger.warn("METAAPI_TOKEN not set — MetaApi sync job will not start");
    return;
  }
  syncMetaApiStatuses();
  setInterval(syncMetaApiStatuses, INTERVAL_MS);
  logger.info({ intervalMs: INTERVAL_MS }, "MetaApi sync job started");
}
