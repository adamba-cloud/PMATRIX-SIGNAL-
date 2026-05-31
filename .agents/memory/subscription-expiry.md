---
name: Subscription expiry enforcement
description: How subscription access control and automatic expiry works in this project.
---

Two complementary pieces enforce subscription gating:

**1. Background expiry job** (`src/lib/expiry-job.ts`)
- Runs on server startup and every hour via `setInterval`
- Queries `subscriptions` where `status = ACTIVE` and `endDate < now`, flips them to `EXPIRED`
- Started in `src/index.ts` via `startExpiryJob()` after server creation

**2. Subscription gate middleware** (`src/lib/require-subscription.ts`)
- Applied to `GET /signals` and `GET /signals/summary` after `requireAuth`
- Admins bypass the check (`req.userRole === "ADMIN"`)
- Returns `403 { error: "Active subscription required", subscriptionRequired: true }` if no active sub

**3. Frontend gate** (`src/pages/signals.tsx`)
- Detects 403 by checking `(error as { status?: number })?.status === 403`
- Renders `<SubscriptionGate>` component with "Subscribe Now" CTA linking to `/subscription`

**Why:** Signals are the core paid product. Gating at the API level prevents circumvention; the frontend gate gives a clean UX instead of a generic error. Admins always bypass for management purposes.

**How to apply:** Any future premium feature should follow the same three-layer pattern: expiry job (if time-limited), `requireSubscription` middleware on the route, and a `SubscriptionGate` component on the page.
