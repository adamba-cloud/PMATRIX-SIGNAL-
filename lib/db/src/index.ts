import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isProduction = process.env.NODE_ENV === "production";

// ── Connection pool ───────────────────────────────────────────────────────────
// Settings tuned for Render's free tier:
//  - max:10 stays within Render PostgreSQL's connection limits
//  - keepAlive prevents idle connections from being dropped by the network
//    layer when Render's service wakes from sleep
//  - ssl required in production (Render PostgreSQL enforces TLS)
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  min: 1,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
  application_name: "pesamatrix-api",
  // Keep-alive prevents idle connections timing out after Render sleep
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  // SSL required for Render PostgreSQL; self-signed cert is fine
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  console.error("[DB pool] idle client error — pool will reconnect automatically:", err.message);
});

pool.on("connect", () => {
  if (!isProduction) {
    console.log("[DB pool] new client connected");
  }
});

export const db = drizzle(pool, { schema });

export * from "./schema";
