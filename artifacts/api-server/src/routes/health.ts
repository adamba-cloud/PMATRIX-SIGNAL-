import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { checkRedisDirect, isRedisAvailable } from "../lib/redis";
import { getSmtpConfig } from "../lib/mailer";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

// ── Liveness — is the process alive? (Render health check) ───────────────────
// Returns 200 immediately with no DB/Redis calls. Used by Render to decide
// whether to restart the container.
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Legacy alias kept for backwards compatibility
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Readiness — is the app ready to serve traffic? ────────────────────────────
// Checks that PostgreSQL is reachable. Returns 503 if not yet ready so that
// a load balancer can hold traffic until the DB connection is established.
router.get("/ready", async (_req, res): Promise<void> => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({
      status: "ready",
      db: "ok",
      redis: isRedisAvailable() ? "ok" : "unavailable",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: "not_ready",
      db: "error",
      error: err instanceof Error ? err.message : "DB unreachable",
      timestamp: new Date().toISOString(),
    });
  }
});

// ── Detailed service health — admin only ──────────────────────────────────────
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
    const result = await checkRedisDirect();
    if (result.ok) {
      services.push({ id: "redis", name: "Redis", status: "ok", detail: "PONG received", latencyMs: result.latencyMs });
    } else {
      services.push({ id: "redis", name: "Redis", status: "error", detail: result.error, latencyMs: null });
    }
  }

  // ── Daraja / M-Pesa ───────────────────────────────────────────────────────
  {
    const missing = ["DARAJA_CONSUMER_KEY", "DARAJA_CONSUMER_SECRET", "DARAJA_BUSINESS_SHORTCODE", "DARAJA_PASSKEY"]
      .filter((k) => !process.env[k]);
    const allSet = missing.length === 0;
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

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  {
    const token = process.env["WHATSAPP_TOKEN"];
    const phoneNumberId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
    const configured = !!(token && phoneNumberId);

    if (!configured) {
      services.push({
        id: "whatsapp",
        name: "WhatsApp (Notifications)",
        status: "not_configured",
        detail: "WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set",
        latencyMs: null,
      });
    } else {
      const t0 = Date.now();
      try {
        const verifyRes = await fetch(
          `https://graph.facebook.com/v19.0/${phoneNumberId}?fields=display_phone_number,verified_name`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const latencyMs = Date.now() - t0;
        if (verifyRes.ok) {
          const data = await verifyRes.json() as { display_phone_number?: string; verified_name?: string };
          services.push({
            id: "whatsapp",
            name: "WhatsApp (Notifications)",
            status: "ok",
            detail: `${data.verified_name ?? "Verified"} · ${data.display_phone_number ?? phoneNumberId}`,
            latencyMs,
          });
        } else {
          const err = await verifyRes.json() as { error?: { message?: string } };
          services.push({
            id: "whatsapp",
            name: "WhatsApp (Notifications)",
            status: "error",
            detail: err?.error?.message ?? `HTTP ${verifyRes.status}`,
            latencyMs,
          });
        }
      } catch (err) {
        services.push({
          id: "whatsapp",
          name: "WhatsApp (Notifications)",
          status: "error",
          detail: err instanceof Error ? err.message : "Verification failed",
          latencyMs: Date.now() - t0,
        });
      }
    }
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
