---
name: Redis auto-start in dev
description: Redis must be started inside the api-server dev npm script — it dies when the Replit workflow restarts.
---

## Rule
Always start Redis as the first step of the `dev` script in `artifacts/api-server/package.json`:

```
"dev": "export NODE_ENV=development && redis-server --daemonize yes --logfile /tmp/redis.log && pnpm run build && pnpm run start"
```

**Why:** Replit workflows kill all child processes when restarted. A separately-daemonized `redis-server` (started manually via bash) is not a child of the workflow and survives the first restart but dies when the container resets. Embedding it in the `dev` script ensures it is always running before the Node process connects.

**How to apply:** Any time Redis is added as a dependency (BullMQ, ioredis, session store, etc.), ensure this pattern is used in the dev script. For production, use a managed Redis URL via `REDIS_URL` env var.
