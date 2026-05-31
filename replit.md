# PESAMATRIX SIGNAL

A premium dark-themed SaaS forex/crypto trading signals platform for serious traders in Kenya and East Africa.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/pesamatrix run dev` — run the frontend (proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS v4 (dark green theme)
- API: Express 5 + JWT auth (jsonwebtoken + bcryptjs)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI source of truth
- `lib/db/src/schema/` — Drizzle schema (users, signals, subscriptions, payments, system_config)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/auth.ts` — JWT + bcrypt auth utilities + Express middleware
- `artifacts/pesamatrix/src/` — React frontend

## Architecture decisions

- JWT tokens stored in localStorage; custom-fetch in `@workspace/api-client-react` attaches Authorization header automatically
- `mustChangePassword` flag on users forces redirect to `/change-password` before accessing any protected route
- Dark theme applied globally via `class="dark"` on `<html>` in `index.html`; Tailwind v4 custom variant `dark` defined in index.css
- Admin-only routes protected by `requireAdmin` middleware; user routes protected by `requireAuth`
- System config (feePerDay, minDays) stored as key/value rows in `system_config` table

## Product

- **Landing page** with scrolling forex ticker (EURUSD, GBPUSD, USDJPY, XAUUSD, XAGUSD, AUDUSD, USDCAD, BTCUSDT)
- **Auth flow**: Login, Register, forced Password Change (mustChangePassword flag)
- **User Dashboard**: stats cards, live market overview, performance chart, recent signals, subscription status
- **Trading Signals** page: BUY/SELL signals with entry/SL/TP data and pip counts
- **Subscription page**: dynamic day selector, auto-calculated cost (feePerDay × days)
- **Payments history** page
- **Admin Dashboard**: platform metrics, user/subscription/payment management
- **Admin Config**: set subscription fee per day and minimum days

## Seeded accounts

- Admin: `craigphilip761@gmail.com` / `TempPass123!` (mustChangePassword=true)
- Test user: `john.trader@gmail.com` / `TempPass123!`

## Gotchas

- Never add `dark` to `@apply` in Tailwind v4 — it's a variant, not a utility class. Apply dark mode by adding `class="dark"` to `<html>`.
- Drizzle returns `numeric` columns as `string`; always `parseFloat()` them before sending in API responses.
- Express 5 wildcard routes need named params: `/{*splat}` not `*`.
- After every OpenAPI spec change: run codegen before touching frontend or backend route code.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
