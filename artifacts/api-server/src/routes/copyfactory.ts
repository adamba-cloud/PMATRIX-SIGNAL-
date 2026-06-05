import { Router } from "express";
import { db, systemConfigTable, slaveAccountsTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import {
  listCopyFactoryStrategies,
  listCopyFactorySubscribers,
  createOrUpdateCopyFactoryStrategy,
  createOrUpdateCopyFactorySubscriber,
} from "../lib/metaapi";
import { logger } from "../lib/logger";

const router = Router();
const STRATEGY_ID = "pesamatrix";

// ── GET /api/admin/copyfactory/diagnostic ─────────────────────────────────────
// Returns the full state of:
//   1. system_config keys (masterMetaApiAccountId, copyFactoryStrategyId)
//   2. All CopyFactory strategies visible under the current METAAPI_TOKEN
//   3. All CopyFactory subscribers visible under the current METAAPI_TOKEN
//   4. All slave_accounts rows in the DB (with MetaApi IDs)
//
// Use this endpoint to verify every step of the provisioning pipeline.

router.get("/admin/copyfactory/diagnostic", requireAdmin, async (_req, res): Promise<void> => {
  const errors: Record<string, string> = {};

  // ── 1. Read system_config ────────────────────────────────────────────────────
  const configRows = await db.select().from(systemConfigTable);
  const configMap = Object.fromEntries(configRows.map((r) => [r.key, r.value]));

  const masterMetaApiAccountId = configMap["masterMetaApiAccountId"] ?? null;
  const copyFactoryStrategyId = configMap["copyFactoryStrategyId"] ?? null;
  const masterEnabled = configMap["masterEnabled"] ?? "true";

  // ── 2. List CopyFactory strategies ──────────────────────────────────────────
  let strategies: unknown[] = [];
  try {
    strategies = await listCopyFactoryStrategies();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors["listStrategies"] = msg;
    logger.error({ err }, "[CopyFactory Diagnostic] listStrategies failed");
  }

  // ── 3. List CopyFactory subscribers ─────────────────────────────────────────
  let subscribers: unknown[] = [];
  try {
    subscribers = await listCopyFactorySubscribers();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors["listSubscribers"] = msg;
    logger.error({ err }, "[CopyFactory Diagnostic] listSubscribers failed");
  }

  // ── 4. All slave accounts in DB ──────────────────────────────────────────────
  const slaveAccounts = await db
    .select({
      id: slaveAccountsTable.id,
      mt5Login: slaveAccountsTable.mt5Login,
      brokerServer: slaveAccountsTable.brokerServer,
      status: slaveAccountsTable.status,
      statusMessage: slaveAccountsTable.statusMessage,
      metaApiAccountId: slaveAccountsTable.metaApiAccountId,
      lastSyncAt: slaveAccountsTable.lastSyncAt,
      createdAt: slaveAccountsTable.createdAt,
    })
    .from(slaveAccountsTable)
    .orderBy(slaveAccountsTable.createdAt);

  // ── 5. Cross-reference: which slaves are registered as CopyFactory subscribers?
  const subscriberIds = new Set(
    (subscribers as Array<{ _id?: string; id?: string }>).map((s) => s._id ?? s.id).filter(Boolean)
  );

  const slaveAccountsWithCopyFactoryStatus = slaveAccounts.map((s) => ({
    ...s,
    lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    registeredInCopyFactory:
      s.metaApiAccountId != null ? subscriberIds.has(s.metaApiAccountId) : false,
  }));

  res.json({
    systemConfig: {
      masterMetaApiAccountId,
      copyFactoryStrategyId,
      masterEnabled,
    },
    copyFactory: {
      strategyCount: strategies.length,
      subscriberCount: subscribers.length,
      strategies,
      subscribers,
    },
    slaveAccounts: slaveAccountsWithCopyFactoryStatus,
    errors,
    diagnosis: {
      strategyExists: strategies.length > 0,
      masterIdConfigured: !!masterMetaApiAccountId,
      strategyIdSaved: !!copyFactoryStrategyId,
      slavesWithoutSubscription: slaveAccountsWithCopyFactoryStatus
        .filter((s) => s.metaApiAccountId && !s.registeredInCopyFactory)
        .map((s) => ({ id: s.id, mt5Login: s.mt5Login, metaApiAccountId: s.metaApiAccountId })),
    },
  });
});

// ── POST /api/admin/copyfactory/setup ────────────────────────────────────────
// Manually trigger CopyFactory setup:
//   1. Create/update the strategy for the master account
//   2. Register all deployed slave accounts as CopyFactory subscribers
//
// Call this if strategy/subscribers are missing (e.g. after fixing config).

router.post("/admin/copyfactory/setup", requireAdmin, async (_req, res): Promise<void> => {
  if (!process.env.METAAPI_TOKEN) {
    res.status(503).json({ error: "METAAPI_TOKEN is not configured" });
    return;
  }

  const configRows = await db.select().from(systemConfigTable);
  const configMap = Object.fromEntries(configRows.map((r) => [r.key, r.value]));
  const masterMetaApiId = configMap["masterMetaApiAccountId"] ?? null;

  if (!masterMetaApiId) {
    res.status(400).json({
      error: "masterMetaApiAccountId is not set in system_config. Go to Admin → Master Account and save the MetaApi Account ID first.",
    });
    return;
  }

  const results: {
    strategy: { ok: boolean; error?: string };
    subscribers: Array<{ metaApiAccountId: string; mt5Login: string; ok: boolean; error?: string }>;
  } = {
    strategy: { ok: false },
    subscribers: [],
  };

  // Step 1: Create/update strategy
  try {
    logger.info({ strategyId: STRATEGY_ID, masterMetaApiId }, "[CopyFactory Setup] Creating strategy");
    await createOrUpdateCopyFactoryStrategy(STRATEGY_ID, masterMetaApiId);
    // Upsert into system_config
    const existing = await db
      .select()
      .from(systemConfigTable)
      .where(eq(systemConfigTable.key, "copyFactoryStrategyId"));
    if (existing.length > 0) {
      await db
        .update(systemConfigTable)
        .set({ value: STRATEGY_ID, updatedAt: new Date() })
        .where(eq(systemConfigTable.key, "copyFactoryStrategyId"));
    } else {
      await db.insert(systemConfigTable).values({ key: "copyFactoryStrategyId", value: STRATEGY_ID });
    }
    results.strategy = { ok: true };
    logger.info({ strategyId: STRATEGY_ID }, "[CopyFactory Setup] Strategy created/updated ✓");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.strategy = { ok: false, error: msg };
    logger.error({ err }, "[CopyFactory Setup] Strategy creation failed");
  }

  // Step 2: Subscribe all slave accounts that have a MetaApi ID
  const slaves = await db
    .select({
      id: slaveAccountsTable.id,
      mt5Login: slaveAccountsTable.mt5Login,
      metaApiAccountId: slaveAccountsTable.metaApiAccountId,
    })
    .from(slaveAccountsTable)
    .where(isNotNull(slaveAccountsTable.metaApiAccountId));

  for (const slave of slaves) {
    const metaApiId = slave.metaApiAccountId!;
    try {
      const name = `PESAMATRIX-${slave.mt5Login}`;
      logger.info({ metaApiId, strategyId: STRATEGY_ID, name }, "[CopyFactory Setup] Subscribing slave");
      await createOrUpdateCopyFactorySubscriber(metaApiId, STRATEGY_ID, name);
      results.subscribers.push({ metaApiAccountId: metaApiId, mt5Login: slave.mt5Login, ok: true });
      logger.info({ metaApiId }, "[CopyFactory Setup] Subscriber registered ✓");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.subscribers.push({
        metaApiAccountId: metaApiId,
        mt5Login: slave.mt5Login,
        ok: false,
        error: msg,
      });
      logger.error({ err, metaApiId }, "[CopyFactory Setup] Subscriber registration failed");
    }
  }

  res.json({
    ok: results.strategy.ok,
    results,
    summary: {
      strategyCreated: results.strategy.ok,
      subscribersAttempted: results.subscribers.length,
      subscribersSucceeded: results.subscribers.filter((s) => s.ok).length,
      subscribersFailed: results.subscribers.filter((s) => !s.ok).length,
    },
  });
});

export default router;
