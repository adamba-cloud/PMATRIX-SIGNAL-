import { Router } from "express";
import { db, systemConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { getMetaApiAccount } from "../lib/metaapi";
import { logger } from "../lib/logger";

const router = Router();

const DEFAULT_MASTER_ID = "99a2b763-0528-4b0e-91ea-79c0be291d5b";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getSystemConfigMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(systemConfigTable);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function upsertConfig(key: string, value: string): Promise<void> {
  const existing = await db.select().from(systemConfigTable).where(eq(systemConfigTable.key, key));
  if (existing.length > 0) {
    await db.update(systemConfigTable).set({ value, updatedAt: new Date() }).where(eq(systemConfigTable.key, key));
  } else {
    await db.insert(systemConfigTable).values({ key, value });
  }
}

// ─── GET /api/admin/master ────────────────────────────────────────────────────

router.get("/admin/master", requireAdmin, async (_req, res): Promise<void> => {
  const map = await getSystemConfigMap();

  const accountId = map["masterMetaApiAccountId"] ?? DEFAULT_MASTER_ID;
  const enabled = map["masterEnabled"] !== "false"; // default true

  let accountStatus: {
    state: string;
    connectionStatus: string;
    synchronizationStatus: string;
    login?: string;
    server?: string;
    platform?: string;
    name?: string;
    broker?: string;
    balance?: number;
    equity?: number;
    leverage?: number;
  } | null = null;

  let lastChecked: string | null = null;
  let error: string | null = null;

  if (accountId) {
    try {
      const acct = await getMetaApiAccount(accountId);
      accountStatus = {
        state: acct.state,
        connectionStatus: acct.connectionStatus,
        synchronizationStatus: acct.synchronizationStatus,
        login: acct.login,
        server: acct.server,
        platform: acct.platform,
        name: acct.name,
        broker: acct.broker,
        balance: acct.balance,
        equity: acct.equity,
        leverage: acct.leverage,
      };
      lastChecked = new Date().toISOString();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to fetch MetaApi account";
      logger.warn({ err, accountId }, "[Master] Failed to fetch account status");
    }
  }

  res.json({
    accountId,
    enabled,
    accountStatus,
    lastChecked,
    error,
  });
});

// ─── PUT /api/admin/master ────────────────────────────────────────────────────

router.put("/admin/master", requireAdmin, async (req, res): Promise<void> => {
  const { accountId, enabled } = req.body as {
    accountId?: string;
    enabled?: boolean;
  };

  if (accountId !== undefined) {
    if (typeof accountId !== "string" || accountId.trim().length === 0) {
      res.status(400).json({ error: "accountId must be a non-empty string" });
      return;
    }
    await upsertConfig("masterMetaApiAccountId", accountId.trim());
    logger.info({ accountId }, "[Master] masterMetaApiAccountId updated");
  }

  if (enabled !== undefined) {
    await upsertConfig("masterEnabled", String(!!enabled));
    logger.info({ enabled }, "[Master] masterEnabled updated");
  }

  res.json({ ok: true });
});

export default router;
