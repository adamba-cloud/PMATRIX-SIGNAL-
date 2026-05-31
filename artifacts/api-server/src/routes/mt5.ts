import { Router } from "express";
import { db, slaveAccountsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { encryptPassword, decryptPassword } from "../lib/encryption";
import {
  createMetaApiAccount,
  deployMetaApiAccount,
  undeployMetaApiAccount,
  deleteMetaApiAccount,
  getMetaApiAccount,
  mapMetaApiStatus,
} from "../lib/metaapi";
import { logger } from "../lib/logger";

const router = Router();

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function formatAccount(a: typeof slaveAccountsTable.$inferSelect) {
  return {
    id: a.id,
    userId: a.userId,
    mt5Login: a.mt5Login,
    brokerServer: a.brokerServer,
    status: a.status,
    statusMessage: a.statusMessage ?? null,
    metaApiAccountId: a.metaApiAccountId ?? null,
    lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

// ─── User endpoints ──────────────────────────────────────────────────────────

router.get("/mt5/accounts", requireAuth, async (req, res): Promise<void> => {
  const accounts = await db
    .select()
    .from(slaveAccountsTable)
    .where(eq(slaveAccountsTable.userId, req.userId!));

  res.json(accounts.map(formatAccount));
});

router.post("/mt5/accounts", requireAuth, async (req, res): Promise<void> => {
  const mt5Login = str(req.body.mt5Login);
  const mt5Password = str(req.body.mt5Password);
  const brokerServer = str(req.body.brokerServer);

  if (!mt5Login || !mt5Password || !brokerServer) {
    res.status(400).json({ error: "mt5Login, mt5Password, and brokerServer are required" });
    return;
  }

  const existing = await db
    .select()
    .from(slaveAccountsTable)
    .where(
      and(
        eq(slaveAccountsTable.userId, req.userId!),
        eq(slaveAccountsTable.mt5Login, mt5Login),
        eq(slaveAccountsTable.brokerServer, brokerServer),
      )
    );

  if (existing.length > 0) {
    res.status(409).json({ error: "An account with this MT5 login and broker server already exists" });
    return;
  }

  const { encrypted, iv, tag } = encryptPassword(mt5Password);

  const [account] = await db
    .insert(slaveAccountsTable)
    .values({
      userId: req.userId!,
      mt5Login,
      passwordEncrypted: encrypted,
      encryptionIv: iv,
      encryptionTag: tag,
      brokerServer,
      status: "SYNCING",
      statusMessage: "Provisioning Cloud Terminal…",
    })
    .returning();

  res.status(201).json(formatAccount(account));

  // Fire-and-forget MetaApi provisioning after response is sent
  if (process.env.METAAPI_TOKEN) {
    setImmediate(async () => {
      let metaApiId: string | undefined;
      try {
        // Step 1: Create the cloud account (register webhook for real-time pushes)
        const domain = process.env.REPLIT_DEV_DOMAIN;
        const webhookUrl = domain
          ? `https://${domain}/api/metaapi/webhook`
          : undefined;

        const created = await createMetaApiAccount({
          login: mt5Login,
          password: mt5Password,
          server: brokerServer,
          name: `PESAMATRIX-${mt5Login}`,
          webhookUrl,
        });
        metaApiId = created.id;

        await db
          .update(slaveAccountsTable)
          .set({
            metaApiAccountId: metaApiId,
            statusMessage: "Cloud terminal created. Deploying — synchronization usually takes 1–2 minutes.",
            updatedAt: new Date(),
          })
          .where(eq(slaveAccountsTable.id, account.id));

        logger.info({ accountId: account.id, metaApiId }, "MetaApi account created");

        // Step 2: Explicitly deploy the cloud terminal
        await deployMetaApiAccount(metaApiId);
        logger.info({ accountId: account.id, metaApiId }, "MetaApi account deployed");

        await db
          .update(slaveAccountsTable)
          .set({
            statusMessage: "Cloud terminal deployed. Synchronizing account data — this usually takes 1–2 minutes.",
            updatedAt: new Date(),
          })
          .where(eq(slaveAccountsTable.id, account.id));
      } catch (err) {
        logger.error({ err, accountId: account.id, metaApiId }, "Failed to provision MetaApi cloud terminal");
        await db
          .update(slaveAccountsTable)
          .set({
            status: "ERROR",
            statusMessage: err instanceof Error ? err.message : "Failed to provision cloud terminal.",
            updatedAt: new Date(),
          })
          .where(eq(slaveAccountsTable.id, account.id));
      }
    });
  }
});

router.get("/mt5/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid account ID" });
    return;
  }

  const [account] = await db
    .select()
    .from(slaveAccountsTable)
    .where(and(eq(slaveAccountsTable.id, id), eq(slaveAccountsTable.userId, req.userId!)));

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  res.json(formatAccount(account));
});

// Live status probe — syncs MetaApi state into DB and returns updated account
router.get("/mt5/accounts/:id/status", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid account ID" });
    return;
  }

  const [account] = await db
    .select()
    .from(slaveAccountsTable)
    .where(and(eq(slaveAccountsTable.id, id), eq(slaveAccountsTable.userId, req.userId!)));

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  if (!account.metaApiAccountId || !process.env.METAAPI_TOKEN) {
    res.json(formatAccount(account));
    return;
  }

  try {
    const state = await getMetaApiAccount(account.metaApiAccountId);
    const { status, message } = mapMetaApiStatus(state);

    const [updated] = await db
      .update(slaveAccountsTable)
      .set({
        status,
        statusMessage: message,
        lastSyncAt: status === "CONNECTED" ? new Date() : account.lastSyncAt,
        updatedAt: new Date(),
      })
      .where(eq(slaveAccountsTable.id, id))
      .returning();

    res.json({
      ...formatAccount(updated),
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
    logger.error({ err, accountId: id }, "MetaApi status fetch failed");
    res.json(formatAccount(account));
  }
});

router.patch("/mt5/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid account ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(slaveAccountsTable)
    .where(and(eq(slaveAccountsTable.id, id), eq(slaveAccountsTable.userId, req.userId!)));

  if (!existing) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const updateValues: Partial<typeof slaveAccountsTable.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  const brokerServer = str(req.body.brokerServer);
  const mt5Password = str(req.body.mt5Password);

  if (brokerServer) updateValues.brokerServer = brokerServer;

  if (mt5Password) {
    const { encrypted, iv, tag } = encryptPassword(mt5Password);
    updateValues.passwordEncrypted = encrypted;
    updateValues.encryptionIv = iv;
    updateValues.encryptionTag = tag;
  }

  const [updated] = await db
    .update(slaveAccountsTable)
    .set(updateValues)
    .where(eq(slaveAccountsTable.id, id))
    .returning();

  res.json(formatAccount(updated));
});

router.delete("/mt5/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid account ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(slaveAccountsTable)
    .where(and(eq(slaveAccountsTable.id, id), eq(slaveAccountsTable.userId, req.userId!)));

  if (!existing) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  await db.delete(slaveAccountsTable).where(eq(slaveAccountsTable.id, id));
  res.status(204).send();

  // Clean up MetaApi account in background
  if (existing.metaApiAccountId && process.env.METAAPI_TOKEN) {
    setImmediate(async () => {
      try {
        await deleteMetaApiAccount(existing.metaApiAccountId!);
        logger.info({ metaApiId: existing.metaApiAccountId }, "MetaApi account deleted");
      } catch (err) {
        logger.warn({ err, metaApiId: existing.metaApiAccountId }, "Failed to delete MetaApi account");
      }
    });
  }
});

router.post("/mt5/accounts/:id/reconnect", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid account ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(slaveAccountsTable)
    .where(and(eq(slaveAccountsTable.id, id), eq(slaveAccountsTable.userId, req.userId!)));

  if (!existing) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const [updated] = await db
    .update(slaveAccountsTable)
    .set({ status: "SYNCING", statusMessage: "Reconnecting to cloud terminal…", updatedAt: new Date() })
    .where(eq(slaveAccountsTable.id, id))
    .returning();

  res.json(formatAccount(updated));

  // Fire-and-forget MetaApi re-deploy
  if (existing.metaApiAccountId && process.env.METAAPI_TOKEN) {
    setImmediate(async () => {
      try {
        await deployMetaApiAccount(existing.metaApiAccountId!);
        logger.info({ metaApiId: existing.metaApiAccountId }, "MetaApi account redeployed");
      } catch (err) {
        logger.warn({ err, metaApiId: existing.metaApiAccountId }, "MetaApi redeploy failed");
        await db
          .update(slaveAccountsTable)
          .set({ status: "ERROR", statusMessage: "Reconnect failed. Please try again.", updatedAt: new Date() })
          .where(eq(slaveAccountsTable.id, id));
      }
    });
  }
});

// ─── Admin endpoints ─────────────────────────────────────────────────────────

router.get("/admin/mt5/accounts", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: slaveAccountsTable.id,
      userId: slaveAccountsTable.userId,
      mt5Login: slaveAccountsTable.mt5Login,
      brokerServer: slaveAccountsTable.brokerServer,
      status: slaveAccountsTable.status,
      statusMessage: slaveAccountsTable.statusMessage,
      metaApiAccountId: slaveAccountsTable.metaApiAccountId,
      lastSyncAt: slaveAccountsTable.lastSyncAt,
      createdAt: slaveAccountsTable.createdAt,
      updatedAt: slaveAccountsTable.updatedAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(slaveAccountsTable)
    .innerJoin(usersTable, eq(slaveAccountsTable.userId, usersTable.id))
    .orderBy(desc(slaveAccountsTable.createdAt));

  res.json(
    rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      mt5Login: r.mt5Login,
      brokerServer: r.brokerServer,
      status: r.status,
      statusMessage: r.statusMessage ?? null,
      metaApiAccountId: r.metaApiAccountId ?? null,
      lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))
  );
});

router.post("/admin/mt5/accounts/:id/reconnect", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid account ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(slaveAccountsTable)
    .where(eq(slaveAccountsTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const [updated] = await db
    .update(slaveAccountsTable)
    .set({ status: "SYNCING", statusMessage: "Admin-initiated reconnect…", updatedAt: new Date() })
    .where(eq(slaveAccountsTable.id, id))
    .returning();

  res.json(formatAccount(updated));

  if (existing.metaApiAccountId && process.env.METAAPI_TOKEN) {
    setImmediate(async () => {
      try {
        await deployMetaApiAccount(existing.metaApiAccountId!);
      } catch (err) {
        logger.warn({ err, metaApiId: existing.metaApiAccountId }, "Admin reconnect: MetaApi deploy failed");
        await db
          .update(slaveAccountsTable)
          .set({ status: "ERROR", statusMessage: "Admin reconnect failed.", updatedAt: new Date() })
          .where(eq(slaveAccountsTable.id, id));
      }
    });
  }
});

router.post("/admin/mt5/accounts/:id/disconnect", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid account ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(slaveAccountsTable)
    .where(eq(slaveAccountsTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const [updated] = await db
    .update(slaveAccountsTable)
    .set({ status: "DISCONNECTED", statusMessage: "Manually disconnected by admin.", updatedAt: new Date() })
    .where(eq(slaveAccountsTable.id, id))
    .returning();

  res.json(formatAccount(updated));

  if (existing.metaApiAccountId && process.env.METAAPI_TOKEN) {
    setImmediate(async () => {
      try {
        await undeployMetaApiAccount(existing.metaApiAccountId!);
      } catch (err) {
        logger.warn({ err, metaApiId: existing.metaApiAccountId }, "Admin disconnect: MetaApi undeploy failed");
      }
    });
  }
});

export default router;
