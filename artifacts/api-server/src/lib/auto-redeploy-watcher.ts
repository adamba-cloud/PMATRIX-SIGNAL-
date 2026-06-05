/**
 * Auto-Redeploy Watcher
 *
 * Polls the MetaApi management API every CHECK_INTERVAL_MS (5 min).
 * If the master account is found in UNDEPLOYED state and `masterEnabled`
 * is not explicitly set to "false" in system_config, it calls deployMetaApiAccount
 * to bring the cloud terminal back online automatically.
 *
 * This guards against MetaApi silently undeploying the account due to inactivity,
 * broker-side disconnects, or platform maintenance.
 */

import { db, systemConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getMetaApiAccountManagementState, deployMetaApiAccount } from "./metaapi";
import { logger } from "./logger";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Backoff on consecutive management-API errors (in ms): 5s → 30s → 2min → 10min → 10min
const BACKOFF_MS = [5_000, 30_000, 120_000, 600_000];

let consecutiveErrors = 0;
let backoffUntil = 0;
let lastKnownState: string | null = null;
let isStarted = false;

async function readSystemConfig(): Promise<Record<string, string>> {
  const rows = await db.select().from(systemConfigTable);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function tick(): Promise<void> {
  // Respect backoff window on management-API errors
  if (Date.now() < backoffUntil) return;

  let config: Record<string, string>;
  try {
    config = await readSystemConfig();
  } catch (err) {
    logger.warn({ err }, "[AutoRedeploy] Failed to read system_config — skipping tick");
    return;
  }

  const accountId = config["masterMetaApiAccountId"] ?? null;
  if (!accountId) {
    // No account configured yet — nothing to watch
    return;
  }

  const masterEnabled = config["masterEnabled"] !== "false"; // default true
  if (!masterEnabled) {
    logger.debug("[AutoRedeploy] masterEnabled=false — skipping auto-redeploy");
    return;
  }

  let state: string;
  try {
    const ms = await getMetaApiAccountManagementState(accountId);
    state = ms.state;
    consecutiveErrors = 0; // reset on success
  } catch (err) {
    consecutiveErrors++;
    const backoffMs = BACKOFF_MS[Math.min(consecutiveErrors - 1, BACKOFF_MS.length - 1)];
    backoffUntil = Date.now() + backoffMs;
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), consecutiveErrors, backoffMs },
      "[AutoRedeploy] Management API error — backing off"
    );
    return;
  }

  const previousState = lastKnownState;
  lastKnownState = state;

  if (state === "UNDEPLOYED") {
    const reason = previousState && previousState !== "UNDEPLOYED"
      ? `state transitioned ${previousState} → UNDEPLOYED`
      : "account is UNDEPLOYED";

    logger.info(
      { accountId, previousState, currentState: state },
      `[AutoRedeploy] Detected ${reason} — triggering auto-redeploy`
    );

    try {
      await deployMetaApiAccount(accountId);
      logger.info(
        { accountId },
        "[AutoRedeploy] Deploy request sent ✓ — MetaApi will bring the cloud terminal online"
      );
    } catch (err) {
      consecutiveErrors++;
      const backoffMs = BACKOFF_MS[Math.min(consecutiveErrors - 1, BACKOFF_MS.length - 1)];
      backoffUntil = Date.now() + backoffMs;
      logger.error(
        { err: err instanceof Error ? err.message : String(err), accountId, consecutiveErrors, backoffMs },
        "[AutoRedeploy] Deploy request failed — will retry after backoff"
      );
    }
  } else if (previousState === "UNDEPLOYED" && state !== "UNDEPLOYED") {
    // Log recovery so it's visible in the server logs
    logger.info(
      { accountId, previousState, currentState: state },
      "[AutoRedeploy] Account recovered from UNDEPLOYED → now in state: " + state
    );
  } else {
    logger.debug(
      { accountId, state },
      "[AutoRedeploy] Account state OK"
    );
  }
}

export function startAutoRedeployWatcher(): void {
  if (isStarted) return;
  isStarted = true;

  // Run first tick quickly (after 30s) to catch a cold-start UNDEPLOYED state
  // without hammering MetaApi before the server has fully initialised.
  setTimeout(() => {
    tick().catch((err) =>
      logger.error({ err }, "[AutoRedeploy] Unexpected error in initial tick")
    );
  }, 30_000);

  setInterval(() => {
    tick().catch((err) =>
      logger.error({ err }, "[AutoRedeploy] Unexpected error in interval tick")
    );
  }, CHECK_INTERVAL_MS);

  logger.info(
    { checkIntervalMs: CHECK_INTERVAL_MS, initialDelayMs: 30_000 },
    "[AutoRedeploy] Watcher started — will auto-redeploy if account goes UNDEPLOYED"
  );
}
