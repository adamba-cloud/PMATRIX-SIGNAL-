/**
 * Spread Guard
 *
 * Before each trade execution, compare the live bid/ask spread to a rolling
 * exponential moving average (EWMA, α=0.1) stored in Redis.
 * If the current spread exceeds 3× the average, mark the symbol as "spread-paused"
 * for 15 seconds and write an audit log entry.
 *
 * The worker calls `checkSpreadGuard` and, if it returns `paused: true`, moves
 * the job to a 15-second delayed state rather than executing the trade.
 */
import { getRedis } from "./redis";
import { writeAuditLog } from "./audit";
import { logger } from "./logger";

const SPREAD_AVG_KEY = (symbol: string) => `spread:avg:${symbol}`;
const SPREAD_PAUSE_KEY = (symbol: string) => `spread:pause:${symbol}`;
const SPREAD_PAUSE_TTL_S = 15;
const EWMA_ALPHA = 0.1;
const SPREAD_THRESHOLD_MULTIPLIER = 3;

/**
 * Fetch the live bid/ask spread for a symbol from MetaApi.
 * Returns null if the symbol price is unavailable.
 */
async function fetchLiveSpread(
  metaApiId: string,
  symbol: string
): Promise<number | null> {
  const token = process.env.METAAPI_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(
      `https://metaapi.cloud/users/current/accounts/${metaApiId}/symbols/${symbol}/current-price`,
      { headers: { "auth-token": token }, signal: AbortSignal.timeout(5_000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { ask?: number; bid?: number };
    if (data.ask == null || data.bid == null) return null;
    return parseFloat((data.ask - data.bid).toFixed(5));
  } catch {
    return null;
  }
}

/**
 * Update the EWMA average for this symbol in Redis.
 */
async function updateSpreadAverage(symbol: string, spread: number): Promise<number> {
  const redis = getRedis();
  const key = SPREAD_AVG_KEY(symbol);
  const stored = await redis.get(key);
  const prevAvg = stored != null ? parseFloat(stored) : spread;
  const newAvg = EWMA_ALPHA * spread + (1 - EWMA_ALPHA) * prevAvg;
  await redis.set(key, newAvg.toFixed(5), "EX", 86400); // 24h TTL
  return newAvg;
}

export interface SpreadGuardResult {
  paused: boolean;
  spread: number | null;
  avg: number | null;
  reason?: string;
}

/**
 * Check spread protection before executing a trade.
 *
 * Returns `{ paused: true }` if the execution should be delayed 15 s.
 * The caller (worker) is responsible for moving the job to delayed state.
 */
export async function checkSpreadGuard(
  metaApiId: string,
  symbol: string
): Promise<SpreadGuardResult> {
  if (!process.env.METAAPI_TOKEN) {
    return { paused: false, spread: null, avg: null };
  }

  const redis = getRedis();

  // Check if already paused for this symbol
  const alreadyPaused = await redis.get(SPREAD_PAUSE_KEY(symbol));
  if (alreadyPaused) {
    return {
      paused: true,
      spread: null,
      avg: null,
      reason: `Spread pause active for ${symbol} — waiting for TTL`,
    };
  }

  const spread = await fetchLiveSpread(metaApiId, symbol);
  if (spread === null) {
    return { paused: false, spread: null, avg: null };
  }

  const avg = await updateSpreadAverage(symbol, spread);

  if (avg > 0 && spread > SPREAD_THRESHOLD_MULTIPLIER * avg) {
    // Pause this symbol for 15 seconds
    await redis.set(SPREAD_PAUSE_KEY(symbol), "1", "EX", SPREAD_PAUSE_TTL_S);

    const reason = `Spread ${spread.toFixed(5)} > ${SPREAD_THRESHOLD_MULTIPLIER}× avg ${avg.toFixed(5)} for ${symbol}`;
    logger.warn({ symbol, spread, avg }, `Spread guard triggered: ${reason}`);

    await writeAuditLog(
      "SPREAD_PAUSE",
      { symbol, spread, avg, multiplier: SPREAD_THRESHOLD_MULTIPLIER, pauseSeconds: SPREAD_PAUSE_TTL_S },
      "WARN"
    );

    return { paused: true, spread, avg, reason };
  }

  return { paused: false, spread, avg };
}
