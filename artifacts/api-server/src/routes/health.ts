import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getRedis } from "../lib/redis";
import { getSmtpConfig } from "../lib/mailer";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

interface ServiceStatus {
  id: string;
  name: string;
  status: "ok" | "error" | "not_configured";
  detail: string;
  latencyMs: number | null;
}

router.get("/admin/health-services", requireAdmin, async (_req, res): Promise<void> => {
  const services: ServiceStatus[] = [];

  // ── Database ──────────────────────────────────────────────────────────────
  {
    const t0 = Date.now();
    try {
      await db.execute(sql`SELECT 1`);
      services.push({ id: "database", name: "PostgreSQL", status: "ok", detail: "Connected", latencyMs: Date.now() - t0 });
    } catch (err) {
      services.push({ id: "database", name: "PostgreSQL", status: "error", detail: err instanceof Error ? err.message : "Query failed", latencyMs: Date.now() - t0 });
    }
  }

  // ── Redis ─────────────────────────────────────────────────────────────────
  {
    const t0 = Date.now();
    try {
      const redis = getRedis();
      await redis.ping();
      services.push({ id: "redis", name: "Redis", status: "ok", detail: "PONG received", latencyMs: Date.now() - t0 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Cannot connect";
      const isUnavailable = msg.includes("not available");
      services.push({
        id: "redis",
        name: "Redis",
        status: isUnavailable ? "not_configured" : "error",
        detail: isUnavailable ? "Not running — copy trading disabled" : msg,
        latencyMs: Date.now() - t0,
      });
    }
  }

  // ── Daraja / M-Pesa ───────────────────────────────────────────────────────
  {
    const key = process.env["DARAJA_CONSUMER_KEY"];
    const secret = process.env["DARAJA_CONSUMER_SECRET"];
    const shortcode = process.env["DARAJA_BUSINESS_SHORTCODE"];
    const passkey = process.env["DARAJA_PASSKEY"];
    const allSet = !!(key && secret && shortcode && passkey);
    const missing = ["DARAJA_CONSUMER_KEY", "DARAJA_CONSUMER_SECRET", "DARAJA_BUSINESS_SHORTCODE", "DARAJA_PASSKEY"]
      .filter((k) => !process.env[k]);
    services.push({
      id: "daraja",
      name: "M-Pesa (Daraja)",
      status: allSet ? "ok" : "not_configured",
      detail: allSet ? "Credentials configured" : `Missing: ${missing.join(", ")}`,
      latencyMs: null,
    });
  }

  // ── MetaAPI ───────────────────────────────────────────────────────────────
  {
    const token = process.env["METAAPI_TOKEN"];
    services.push({
      id: "metaapi",
      name: "MetaAPI (MT5 Sync)",
      status: token ? "ok" : "not_configured",
      detail: token ? "Token configured" : "METAAPI_TOKEN not set — MT5 sync disabled",
      latencyMs: null,
    });
  }

  // ── SMTP / Email ──────────────────────────────────────────────────────────
  {
    try {
      const cfg = await getSmtpConfig();
      const configured = !!(cfg.host && cfg.user && cfg.pass);
      services.push({
        id: "smtp",
        name: "SMTP (Email)",
        status: configured ? "ok" : "not_configured",
        detail: configured ? `${cfg.host}:${cfg.port} as ${cfg.user}` : "SMTP_HOST / SMTP_USER / SMTP_PASS not set",
        latencyMs: null,
      });
    } catch {
      services.push({ id: "smtp", name: "SMTP (Email)", status: "error", detail: "Failed to read SMTP config", latencyMs: null });
    }
  }

  // ── VAPID / Web Push ──────────────────────────────────────────────────────
  {
    const pub = process.env["VAPID_PUBLIC_KEY"];
    const priv = process.env["VAPID_PRIVATE_KEY"];
    const configured = !!(pub && priv);
    services.push({
      id: "vapid",
      name: "Web Push (VAPID)",
      status: configured ? "ok" : "not_configured",
      detail: configured ? "Keys configured" : "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set",
      latencyMs: null,
    });
  }

  // ── JWT ───────────────────────────────────────────────────────────────────
  {
    const jwtSecret = process.env["JWT_SECRET"];
    const isDefault = !jwtSecret || jwtSecret === "pesamatrix-secret-key-change-in-prod";
    services.push({
      id: "jwt",
      name: "JWT Auth",
      status: isDefault ? "not_configured" : "ok",
      detail: isDefault ? "Using insecure default — set JWT_SECRET before going live" : "Custom secret configured",
      latencyMs: null,
    });
  }

  res.json({ checkedAt: new Date().toISOString(), services });
});

export default router;
