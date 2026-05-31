import { Router } from "express";
import { db, slaveAccountsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
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

// ─── Admin endpoints ────────────────────────────────────────────────────────

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
});

export default router;
