import { Router } from "express";
import { db, systemConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { getSmtpConfig, sendPasswordResetEmail } from "../lib/mailer";

const router = Router();

const SMTP_KEYS = ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from", "app_url"] as const;

async function getRow(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: systemConfigTable.value })
    .from(systemConfigTable)
    .where(eq(systemConfigTable.key, key));
  return row?.value ?? null;
}

async function upsert(key: string, value: string) {
  const existing = await getRow(key);
  if (existing !== null) {
    await db.update(systemConfigTable).set({ value }).where(eq(systemConfigTable.key, key));
  } else {
    await db.insert(systemConfigTable).values({ key, value });
  }
}

router.get("/admin/smtp", requireAdmin, async (_req, res): Promise<void> => {
  const results = await Promise.all(SMTP_KEYS.map((k) => getRow(k)));
  const [host, port, user, pass, from, appUrl] = results;
  res.json({
    host: host ?? "",
    port: port ?? "587",
    user: user ?? "",
    hasPassword: !!pass,
    from: from ?? "",
    appUrl: appUrl ?? "",
  });
});

router.post("/admin/smtp", requireAdmin, async (req, res): Promise<void> => {
  const { host, port, user, password, from, appUrl } = req.body as {
    host?: string;
    port?: string;
    user?: string;
    password?: string;
    from?: string;
    appUrl?: string;
  };

  const ops: Promise<void>[] = [];
  if (host !== undefined) ops.push(upsert("smtp_host", host));
  if (port !== undefined) ops.push(upsert("smtp_port", port));
  if (user !== undefined) ops.push(upsert("smtp_user", user));
  if (password && password !== "••••••••") ops.push(upsert("smtp_pass", password));
  if (from !== undefined) ops.push(upsert("smtp_from", from));
  if (appUrl !== undefined) ops.push(upsert("app_url", appUrl));

  await Promise.all(ops);
  res.json({ success: true });
});

router.post("/admin/smtp/test", requireAdmin, async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const cfg = await getSmtpConfig();
  if (!cfg.host || !cfg.user || !cfg.pass) {
    res.status(400).json({ error: "SMTP is not configured. Save your settings first." });
    return;
  }

  try {
    await sendPasswordResetEmail(email, "Admin", "test-token-not-real");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to send test email" });
  }
});

export default router;
