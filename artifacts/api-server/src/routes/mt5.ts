import { Router } from "express";
import { db, slaveAccountsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { encryptPassword } from "../lib/encryption";

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
      status: "DISCONNECTED",
    })
    .returning();

  res.status(201).json(formatAccount(account));
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

  if (brokerServer) {
    updateValues.brokerServer = brokerServer;
  }

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
    .set({ status: "SYNCING", statusMessage: "Attempting to reconnect…", updatedAt: new Date() })
    .where(eq(slaveAccountsTable.id, id))
    .returning();

  res.json(formatAccount(updated));
});

export default router;
