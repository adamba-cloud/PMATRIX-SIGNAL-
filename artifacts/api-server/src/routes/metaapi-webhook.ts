import { Router } from "express";
import { db, slaveAccountsTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { getMetaApiAccount, mapMetaApiStatus } from "../lib/metaapi";
import { broadcastMt5Status } from "../lib/forex-ws";
import { logger } from "../lib/logger";

const router = Router();

/**
 * POST /api/metaapi/webhook
 *
 * MetaApi posts account status-change events here when a webhookUrl is
 * registered on an account.  We extract the accountId from the payload,
 * re-fetch authoritative state from the MetaApi REST API, persist it, and
 * broadcast the update to all connected WebSocket clients so the frontend
 * updates in real time without waiting for the next poll cycle.
 */
router.post("/metaapi/webhook", async (req, res): Promise<void> => {
  res.status(200).json({ ok: true });

  const body = req.body as Record<string, unknown>;
  const metaApiId =
    typeof body.accountId === "string" ? body.accountId :
    typeof body.id === "string" ? body.id : null;

  if (!metaApiId || !process.env.METAAPI_TOKEN) {
    logger.debug({ body }, "MetaApi webhook: ignored (no accountId or token)");
    return;
  }

  logger.info({ metaApiId, type: body.type }, "MetaApi webhook received");

  const accounts = await db
    .select()
    .from(slaveAccountsTable)
    .where(eq(slaveAccountsTable.metaApiAccountId, metaApiId));

  if (accounts.length === 0) {
    logger.warn({ metaApiId }, "MetaApi webhook: no local account found");
    return;
  }

  await Promise.allSettled(
    accounts.map(async (account) => {
      try {
        const state = await getMetaApiAccount(metaApiId);
        const { status, message } = mapMetaApiStatus(state);

        const [updated] = await db
          .update(slaveAccountsTable)
          .set({
            status,
            statusMessage: message,
            lastSyncAt: status === "CONNECTED" ? new Date() : account.lastSyncAt,
            updatedAt: new Date(),
          })
          .where(eq(slaveAccountsTable.id, account.id))
          .returning();

        logger.info(
          { accountId: account.id, metaApiId, status },
          "MetaApi webhook: status updated"
        );

        broadcastMt5Status({
          accountId: updated.id,
          userId: updated.userId,
          status: updated.status,
          statusMessage: updated.statusMessage ?? null,
          lastSyncAt: updated.lastSyncAt?.toISOString() ?? null,
          updatedAt: updated.updatedAt.toISOString(),
          telemetry: {
            connectionStatus: state.connectionStatus,
            synchronizationStatus: state.synchronizationStatus,
            state: state.state,
            balance: state.balance ?? null,
            equity: state.equity ?? null,
            margin: state.margin ?? null,
            freeMargin: state.freeMargin ?? null,
            leverage: state.leverage ?? null,
            currency: state.currency ?? null,
            broker: state.broker ?? null,
            tradeAllowed: state.tradeAllowed ?? null,
          },
        });
      } catch (err) {
        logger.error(
          { err, accountId: account.id, metaApiId },
          "MetaApi webhook: failed to refresh account state"
        );
      }
    })
  );
});

export default router;
