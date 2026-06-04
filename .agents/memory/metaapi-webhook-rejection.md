---
name: MetaApi webhookUrl rejection on slave account creation
description: MetaApi rejects Replit dev-tunnel URLs as webhookUrl, silently killing all slave account creation attempts.
---

## Rule
Never send `webhookUrl` when calling `createMetaApiAccount` for slave accounts. Replit dev-tunnel domains (`*.worf.replit.dev`, `*.replit.dev`) are rejected by MetaApi with HTTP 400 ValidationError `"Unexpected value"`, causing every slave account creation to fail before MetaApi even registers the account.

**Why:** MetaApi validates the `webhookUrl` field against an allowlist or URL format check that rejects Replit's ephemeral dev-tunnel hostnames. The master account works because it is registered manually via the admin panel (just an account ID) — `createMetaApiAccount` is never called for it.

**How to apply:** Omit `webhookUrl` from all `createMetaApiAccount` calls. The MetaApi sync job (polls every 10 s via management API) keeps slave account status current without needing webhooks. If production webhooks are ever needed, gate on an explicit `METAAPI_WEBHOOK_URL` env var set to the verified production domain — never derive it from `REPLIT_DEV_DOMAIN`.
