---
name: MetaApi correct REST API URLs
description: The correct base URLs for MetaApi trading and management APIs — metaapi.cloud is NOT the API.
---

## The rule

`https://metaapi.cloud` is the Next.js **marketing website**. Sending REST API calls to it returns the website's HTML 404 page, regardless of `auth-token` or `Accept` headers.

The actual REST APIs are at:

| API | Base URL | Confirmed endpoints |
|-----|----------|-------------------|
| **Trading API** | `https://mt-client-api-v1.{region}.agiliumtrade.ai` | `/users/current/accounts/{id}/accountInformation` → 200 ✅, `/users/current/accounts/{id}/positions` → 200 ✅, `/users/current/accounts/{id}/trade` → 200 ✅ |
| **Management API** | `https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai` | `/users/current/accounts` (POST create), `/{id}/deploy`, `/{id}/undeploy`, `/{id}` (DELETE) |

The confirmed working region for the user's account (`99a2b763-0528-4b0e-91ea-79c0be291d5b`, Exness KE, cloud-g2 tag) is **london**.

## accountInformation endpoint

`GET /users/current/accounts/{id}/accountInformation` returns:
```json
{
  "platform": "mt5",
  "broker": "Exness (KE) Limited",
  "currency": "GBP",
  "server": "ExnossKE-MT5Trial10",
  "balance": 1491291.85,
  "equity": 1491291.85,
  "margin": 0,
  "freeMargin": 1491291.85,
  "leverage": 400,
  "tradeAllowed": true,
  "name": "CRAIG",
  "login": 81654842
}
```
`login` is a **number** — convert with `String(info.login)` before storing in `MetaApiAccountState.login` (which is typed as `string`). `state`/`connectionStatus`/`synchronizationStatus` are not in this response — synthesise as DEPLOYED/CONNECTED/SYNCHRONIZED when the call succeeds (i.e. the account is reachable).

## Region env var

`METAAPI_REGION` env var controls the region (default `london`). Change if the user provisions accounts in a different region.

**Why:** Spent a full debugging session chasing `Accept: application/json` as the fix before realising `metaapi.cloud` was the website router all along. The `mt-client-api-v1.{region}.agiliumtrade.ai` URL was found by probing alternatives and discovering it returned JSON instead of HTML.

**How to apply:** Always use `TRADING_BASE = https://mt-client-api-v1.${METAAPI_REGION ?? "london"}.agiliumtrade.ai` for positions, trades, and account info. Only use `MANAGEMENT_BASE = https://metaapi.cloud` for account create/deploy/undeploy/delete (management plane).
