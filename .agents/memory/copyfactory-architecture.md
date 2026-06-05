---
name: CopyFactory architecture and bugs
description: CopyFactory URL, strategy ID format, payload schema — all confirmed working as of 2026-06-05.
---

## What was found (initial audit)

### CopyFactory — never implemented (fixed previously)
- `createStrategy()` and `updateSubscriber()` were never called anywhere in the codebase.
- Fixed: Added CopyFactory API functions to `metaapi.ts`; wired strategy creation into `master.ts` PUT handler; wired subscriber creation/deletion into `mt5.ts` provisioning flow.
- Diagnostic endpoint: `GET /api/admin/copyfactory/diagnostic` and `POST /api/admin/copyfactory/setup`.

### master-poller.ts — always returned empty (fixed previously)
- Master account lives in `system_config` (key: `masterMetaApiAccountId`), NOT in `slave_accounts`.
- Fixed: read master from `system_config`, fan out to all connected `slave_accounts` directly.

### master-trade-execution-worker.ts — always skipped fan-out (fixed previously)
- Fixed: verify metaApiAccountId matches `system_config.masterMetaApiAccountId`; query all connected slaves directly.

## COPYFACTORY_BASE URL fix (2026-06-05)

**Root cause of "fetch failed" / "listStrategies: fetch failed":**
The non-region hostname `copyfactory-api-v1.agiliumtrade.agiliumtrade.ai` has NO DNS records — returns HTTP 000 / TypeError: fetch failed from Replit.

**Fix:** Use region-based URL:
```
https://copyfactory-api-v1.${METAAPI_REGION ?? "london"}.agiliumtrade.ai
```
Both `london` and `new-york` regions resolve and return HTTP 200.

## Strategy ID constraint (2026-06-05)

CopyFactory strategy IDs must be **exactly 4 alphanumeric characters**.
- `"pesamatrix"` → rejected HTTP 400: "Strategy id must be 4 characters long"
- `"pesm"` → accepted ✅

All route files updated: `STRATEGY_ID = "pesm"` in `master.ts` and `copyfactory.ts`.

## Strategy creation payload (confirmed HTTP 204 ✅)

```json
{
  "name": "PESAMATRIX Master Strategy",
  "description": "...",
  "accountId": "<masterMetaApiAccountId>",
  "timeSettings": {
    "lifetimeInHours": 876000,
    "openingIntervalInMinutes": 5
  }
}
```

**NOT** `connectionId` (old field name — rejected 400).
**No** `positionLifecycle` field — any value is rejected with "Unexpected value".

## Live state (2026-06-05)
- Strategy `pesm` live, linked to `99a2b763-0528-4b0e-91ea-79c0be291d5b`
- `system_config`: `copyFactoryStrategyId=pesm`, `masterMetaApiAccountId=99a2b763-0528-4b0e-91ea-79c0be291d5b`
- 0 subscribers (no slave accounts enrolled yet — normal)
- `errors: {}` — diagnostic endpoint clean

## Current architecture

- **CopyFactory** is the primary copy-trading mechanism.
- **master-poller** and **master-trade-execution-worker** DISABLED in `index.ts`.
- **master-trade-listener** continues for monitoring only.

**Why:** Region-based URLs are the pattern for ALL MetaApi APIs. The double-domain hostname was a stale/wrong reference.

**How to apply:** All three MetaApi API bases:
- Trading: `mt-client-api-v1.{region}.agiliumtrade.ai`
- Management: `mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai` (no region needed here)
- CopyFactory: `copyfactory-api-v1.{region}.agiliumtrade.ai`
