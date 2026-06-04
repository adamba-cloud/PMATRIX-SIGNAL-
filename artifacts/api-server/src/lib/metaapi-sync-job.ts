import { and, eq, isNotNull, or, gte } from "drizzle-orm";
import { db, slaveAccountsTable } from "@workspace/db";
import { logger } from "./logger";
import {
  getMetaApiAccountManagementState,
  getMetaApiAccount,
  mapMetaApiStatus,
  parseMetaApiError,
} from "./metaapi";

const INTERVAL_MS = 10 * 1000;
const PROVISIONING_WINDOW_MS = 12 * 60 * 1000; // re-check ERROR accounts up to 12 min after creation
const STUCK_SYNCING_MS = 15 * 60 * 1000; // mark as ERROR if still SYNCING after 15 min

async function syncMetaApiStatuses(): Promise<void> {
  if (!process.env.METAAPI_TOKEN) return;

  const windowStart = new Date(Date.now() - PROVISIONING_WINDOW_MS);

  let accounts: (typeof slaveAccountsTable.$inferSelect)[];
  try {
    accounts = await db
      .select()
      .from(slaveAccountsTable)
      .where(
        and(
          isNotNull(slaveAccountsTable.metaApiAccountId),
          or(
            // All accounts still actively syncing
            eq(slaveAccountsTable.status, "SYNCING"),
            // Error accounts that are still young — provisioning may still be in progress
            and(
              eq(slaveAccountsTable.status, "ERROR"),
              gte(slaveAccountsTable.createdAt, windowStart),
            ),
          ),
        )
      );
  } catch (err) {
    logger.error({ err }, "MetaApi sync: failed to query accounts");
    return;
  }

  if (accounts.length === 0) return;

  logger.debug({ count: accounts.length }, "MetaApi sync: checking accounts");

  await Promise.allSettled(
    accounts.map(async (account) => {
      const metaApiId = account.metaApiAccountId!;
      const ageMs = Date.now() - account.createdAt.getTime();

      try {
        // Detect stuck provisioning before calling the API
        if (account.status === "SYNCING" && ageMs > STUCK_SYNCING_MS) {
          await db
            .update(slaveAccountsTable)
            .set({
              status: "ERROR",
              statusMessage:
                "Provisioning timed out after 15 minutes. Please delete this account and try again, or contact support.",
              updatedAt: new Date(),
            })
            .where(eq(slaveAccountsTable.id, account.id));
          logger.warn({ accountId: account.id, metaApiId }, "MetaApi sync: provisioning timed out");
          return;
        }

        let state;

        // During provisioning (first 3 min or still SYNCING) use the management API.
        // The trading /accountInformation endpoint only responds once fully connected.
        // Calling it too early returns a 4xx and would wrongly flip the account to ERROR.
        const useManagementApi = account.status === "SYNCING" || ageMs < 3 * 60 * 1000;

        if (useManagementApi) {
          state = await getMetaApiAccountManagementState(metaApiId);
        } else {
          // Account is older + in ERROR — try the trading API to see if it recovered
          try {
            state = await getMetaApiAccount(metaApiId);
          } catch {
            // Trading API still unavailable — check management API as fallback
            state = await getMetaApiAccountManagementState(metaApiId);
          }
        }

        const { status, message } = mapMetaApiStatus(state);

        const needsUpdate = account.status !== status || account.statusMessage !== message;

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
            { accountId: account.id, metaApiId, from: account.status, to: status },
            "MetaApi sync: status updated",
          );
        }
      } catch (err) {
        logger.warn(
          { err, accountId: account.id, metaApiId },
          "MetaApi sync: failed to fetch status for account",
        );
        // Don't flip to ERROR on transient failures during early provisioning —
        // the terminal takes 1–2 min to spin up and will throw 4xx until ready.
        const isEarlyProvisioning = ageMs < 3 * 60 * 1000;
        if (!isEarlyProvisioning) {
          await db
            .update(slaveAccountsTable)
            .set({
              status: "ERROR",
              statusMessage: parseMetaApiError(err),
              updatedAt: new Date(),
            })
            .where(eq(slaveAccountsTable.id, account.id));
        }
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
