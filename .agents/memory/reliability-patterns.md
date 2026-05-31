---
name: Reliability layer patterns
description: How the kill switch, spread guard, and payment reconciler are implemented in this project.
---

## Kill Switch (connection-watchdog.ts)
- Master poller calls `updateMasterHeartbeat(metaApiId)` after every successful `getAccountPositions` call — sets `watchdog:heartbeat:<id>` in Redis with 30s TTL.
- Watchdog runs every 10s, checks all active master accounts from DB.
- Tracks first-absent time in `watchdog:absent_since:<id>`. If absent > 60s: sets `watchdog:emergency:paused` in Redis and calls `queue.pause()`.
- On recovery (all heartbeats restored): `redis.del(EMERGENCY_KEY)` + `queue.resume()`.
- Worker checks `EMERGENCY_KEY` before executing; if set, calls `job.moveToDelayed(+30s, token)`.

**Why:** BullMQ's built-in queue.pause() is the right primitive. Redis TTL-based heartbeat avoids DB polling for liveness.

## Spread Guard (spread-guard.ts)
- Before each trade, fetches live bid/ask from MetaApi `/symbols/{symbol}/current-price`.
- Maintains EWMA (α=0.1) of spread per symbol in Redis key `spread:avg:<symbol>` with 24h TTL.
- If spread > 3× avg: sets `spread:pause:<symbol>` with 15s TTL (subsequent workers check this to avoid re-querying MetaApi).
- Worker calls `job.moveToDelayed(Date.now() + 15_000, token)` when guard fires — job re-runs after 15s without consuming an attempt.

**Why:** `moveToDelayed` is the correct BullMQ pattern for re-scheduling without incrementing the retry counter.

## Payment Reconciler (payment-reconciler.ts)
- Runs every 5 min (first run delayed 60s after server boot).
- Queries PENDING payments with `checkoutRequestId` older than 2 minutes.
- Calls Daraja STK query endpoint (`/mpesa/stkpushquery/v1/query`) with same shortCode/password/timestamp pattern as STK push.
- On success (ResultCode=0): COMPLETED + activates subscription. On failure: FAILED + CANCELLED sub.
- All transitions written to `system_audit_logs` table.
- Gated on `DARAJA_CONSUMER_KEY/SECRET/BUSINESS_SHORTCODE/PASSKEY` env vars.

## DB Audit Log (system_audit_logs table)
Generic table for system events: `event` (text), `severity` (INFO/WARN/ERROR), `payload` (JSON text), `createdAt`.
Helper: `writeAuditLog(event, payload?, severity?)` in `audit.ts` — never throws, logs + continues on DB error.

## DB Pool Config
Pool params in `lib/db/src/index.ts`: max=20, idleTimeoutMillis=30_000, connectionTimeoutMillis=5_000, statement_timeout=15_000, application_name="pesamatrix-api".
