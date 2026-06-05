---
name: CopyFactory architecture and broken-poller bugs
description: Complete audit of the copy-trading system: CopyFactory was never implemented; both custom pollers had a fatal master-lookup bug; fixes applied.
---

## What was found

### CopyFactory — never implemented
- `createStrategy()` and `updateSubscriber()` were never called anywhere in the codebase.
- MetaApi Trade Copier showed 0 strategies / 0 subscribers as expected.
- Fixed: Added CopyFactory API functions to `metaapi.ts`; wired strategy creation into `master.ts` PUT handler; wired subscriber creation/deletion into `mt5.ts` provisioning flow.
- Strategy ID convention: fixed string `"pesamatrix"` — idempotent PUT, stored in `system_config.copyFactoryStrategyId`.
- Diagnostic endpoint: `GET /api/admin/copyfactory/diagnostic` and `POST /api/admin/copyfactory/setup`.

### master-poller.ts — always returned empty
- Queried `copyTradeLinksTable` joining on `slave_accounts.id` for the master account.
- Master account lives in `system_config` (key: `masterMetaApiAccountId`), NOT in `slave_accounts`.
- Result: `links.length === 0` every cycle → silent return → zero trades copied.
- Fixed: read master from `system_config`, fan out to all connected `slave_accounts` directly.

### master-trade-execution-worker.ts — always skipped fan-out
- Called `db.select().from(slaveAccountsTable).where(eq(slaveAccountsTable.metaApiAccountId, metaApiAccountId))` to find master.
- Master not in `slave_accounts` → `masterAccount` always null → logged "Master account not found" → returned.
- Fixed: verify metaApiAccountId matches `system_config.masterMetaApiAccountId`; query all connected slaves directly.

### copy_trade_links table — was always empty
- No admin UI or provisioning code ever inserted rows.
- Fixed by eliminating dependency on this table (single-master architecture needs no link table).

## Current architecture (post-fix)

- **CopyFactory** is the primary copy-trading mechanism — MetaApi handles trade replication at their level.
- **master-poller** and **master-trade-execution-worker** are DISABLED in `index.ts` to prevent double-execution.
- **master-trade-listener** continues to monitor positions and log events (monitoring only, no execution).

**Why:** CopyFactory + custom-poller = double trades on every slave. CopyFactory is more reliable (MetaApi-native, no polling lag).

## Post-deployment action required

After deploying new code, admin must trigger strategy creation:
1. Call `POST /api/admin/copyfactory/setup` (requires admin JWT)
2. OR go to Admin → Master Account, click Save (triggers strategy creation automatically)
3. Verify via `GET /api/admin/copyfactory/diagnostic`

## copyTradeLogsTable FK constraint
`copy_trade_logs.masterAccountId` has FK to `slave_accounts.id`. Cannot use VIRTUAL_MASTER_ID=0 without FK violation. Safe to leave — both custom execution paths are disabled; the table is only written by the disabled pollers.
