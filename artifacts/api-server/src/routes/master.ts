import { Router } from "express";
import { db, systemConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import {
  getMetaApiAccount,
  deployMetaApiAccount,
  undeployMetaApiAccount,
  createOrUpdateCopyFactoryStrategy,
} from "../lib/metaapi";
import { logger } from "../lib/logger";

// Fixed strategy ID — CopyFactory requires exactly 4 alphanumeric characters.
// We use "pesm" (short for PESAMATRIX). Stored in system_config after first creation.
const STRATEGY_ID = "pesm";

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
    if (typeof accountId !== "string") {
      res.status(400).json({ error: "accountId must be a string" });
      return;
    }
    const trimmedId = accountId.trim();

    // Determine which MetaApi ID to use for CopyFactory:
    // - Non-empty → save it and use it
    // - Empty string → don't overwrite the stored ID; re-trigger CopyFactory with the existing one
    let masterMetaApiIdForStrategy: string | null = null;

    if (trimmedId.length > 0) {
      await upsertConfig("masterMetaApiAccountId", trimmedId);
      logger.info({ accountId: trimmedId }, "[Master] masterMetaApiAccountId updated");
      masterMetaApiIdForStrategy = trimmedId;
    } else {
      // Empty string — user wants to re-trigger strategy setup without re-typing the ID
      const existingRows = await db.select().from(systemConfigTable).where(eq(systemConfigTable.key, "masterMetaApiAccountId"));
      masterMetaApiIdForStrategy = existingRows[0]?.value ?? null;
      if (masterMetaApiIdForStrategy) {
        logger.info({ accountId: masterMetaApiIdForStrategy }, "[Master] Empty accountId in body — re-triggering CopyFactory with existing stored ID");
      } else {
        logger.warn("[Master] Empty accountId and no stored masterMetaApiAccountId — nothing to do");
      }
    }

    // ── CopyFactory strategy setup ────────────────────────────────────────────
    if (masterMetaApiIdForStrategy && process.env.METAAPI_TOKEN) {
      try {
        logger.info(
          { strategyId: STRATEGY_ID, masterMetaApiId: masterMetaApiIdForStrategy },
          "[CopyFactory] Creating/updating strategy for master account"
        );
        await createOrUpdateCopyFactoryStrategy(STRATEGY_ID, masterMetaApiIdForStrategy);
        await upsertConfig("copyFactoryStrategyId", STRATEGY_ID);
        logger.info(
          { strategyId: STRATEGY_ID, masterMetaApiId: masterMetaApiIdForStrategy },
          "[CopyFactory] Strategy created/updated successfully — strategyId saved to system_config"
        );
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : String(err);
        logger.error(
          { err, strategyId: STRATEGY_ID, masterMetaApiId: masterMetaApiIdForStrategy, rawMessage },
          "[CopyFactory] Failed to create/update strategy — check raw error above"
        );
        // Don't fail the whole request — master ID is saved, strategy setup is best-effort
      }
    } else if (!process.env.METAAPI_TOKEN) {
      logger.warn("[CopyFactory] METAAPI_TOKEN not set — skipping strategy setup");
    }
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
