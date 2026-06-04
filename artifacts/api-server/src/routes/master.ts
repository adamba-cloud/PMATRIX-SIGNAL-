import { Router } from "express";
import { db, systemConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { getMetaApiAccount, deployMetaApiAccount, undeployMetaApiAccount } from "../lib/metaapi";
import { logger } from "../lib/logger";

const router = Router();

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

/**
 * Converts a raw MetaApi error (which can contain an entire HTML page) into a
 * short, human-readable string safe to surface in the UI.
 */
function extractMetaApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  // 404 — account not found
  if (raw.includes("(404)")) {
    return "Account not found on MetaApi — verify the Account ID is correct and the account belongs to your MetaApi token.";
  }

  // Strip any HTML tags and collapse whitespace, cap at 200 chars
  const clean = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > 200 ? clean.slice(0, 197) + "…" : clean;
}

// ─── GET /api/admin/master ────────────────────────────────────────────────────

router.get("/admin/master", requireAdmin, async (_req, res): Promise<void> => {
  const map = await getSystemConfigMap();

  const accountId = map["masterMetaApiAccountId"] ?? null;
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
      error = extractMetaApiError(err);
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

// ─── POST /api/admin/master/deploy ───────────────────────────────────────────

router.post("/admin/master/deploy", requireAdmin, async (_req, res): Promise<void> => {
  const map = await getSystemConfigMap();
  const accountId = map["masterMetaApiAccountId"] ?? null;

  if (!accountId) {
    res.status(400).json({ error: "No master account ID configured. Enter a MetaApi Account ID first." });
    return;
  }

  try {
    await deployMetaApiAccount(accountId);
    logger.info({ accountId }, "[Master] Deploy triggered");
    res.json({ ok: true });
  } catch (err) {
    const msg = extractMetaApiError(err);
    logger.error({ err, accountId }, "[Master] Deploy failed");
    res.status(500).json({ error: msg });
  }
});

// ─── POST /api/admin/master/undeploy ─────────────────────────────────────────

router.post("/admin/master/undeploy", requireAdmin, async (_req, res): Promise<void> => {
  const map = await getSystemConfigMap();
  const accountId = map["masterMetaApiAccountId"] ?? null;

  if (!accountId) {
    res.status(400).json({ error: "No master account ID configured. Enter a MetaApi Account ID first." });
    return;
  }

  try {
    await undeployMetaApiAccount(accountId);
    logger.info({ accountId }, "[Master] Undeploy triggered");
    res.json({ ok: true });
  } catch (err) {
    const msg = extractMetaApiError(err);
    logger.error({ err, accountId }, "[Master] Undeploy failed");
    res.status(500).json({ error: msg });
  }
});

export default router;
