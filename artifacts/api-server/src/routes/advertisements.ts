import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, advertisementsTable, advertisementSettingsTable } from "@workspace/db";
import { eq, and, desc, lte, gte, isNotNull } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import type { AuthedRequest } from "../lib/auth";
import { initiateStkPush, formatPhone } from "../lib/daraja";
import { paymentsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

const uploadDir = path.resolve("public/uploads/ads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

async function getSettings() {
  const rows = await db.select().from(advertisementSettingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db
    .insert(advertisementSettingsTable)
    .values({ feePerDay: "100", minDays: 1, maxDays: 90 })
    .returning();
  return created;
}

// ─── Public / User ────────────────────────────────────────────────────────────

router.get("/advertisements/settings", requireAuth, async (_req, res): Promise<void> => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to load settings" });
  }
});

router.get("/advertisements/active", async (_req, res): Promise<void> => {
  try {
    const now = new Date();
    const ads = await db
      .select()
      .from(advertisementsTable)
      .where(
        and(
          eq(advertisementsTable.status, "APPROVED"),
          isNotNull(advertisementsTable.startDate),
          lte(advertisementsTable.startDate, now),
          isNotNull(advertisementsTable.endDate),
          gte(advertisementsTable.endDate, now)
        )
      )
      .orderBy(desc(advertisementsTable.createdAt));
    res.json(ads);
  } catch (err) {
    res.status(500).json({ error: "Failed to load advertisements" });
  }
});

router.get("/advertisements/mine", requireAuth, async (req, res): Promise<void> => {
  try {
    const user = (req as AuthedRequest).user;
    const ads = await db
      .select()
      .from(advertisementsTable)
      .where(eq(advertisementsTable.userId, user.id))
      .orderBy(desc(advertisementsTable.createdAt));
    res.json(ads);
  } catch (err) {
    res.status(500).json({ error: "Failed to load your advertisements" });
  }
});

router.post(
  "/advertisements",
  requireAuth,
  upload.single("file"),
  async (req, res): Promise<void> => {
    try {
      const user = (req as AuthedRequest).user;
      const { title, description, mediaType, externalLink, totalDays } = req.body as {
        title?: string;
        description?: string;
        mediaType?: string;
        externalLink?: string;
        totalDays?: string;
      };

      if (!title || !mediaType || !totalDays) {
        res.status(400).json({ error: "title, mediaType, and totalDays are required" });
        return;
      }

      const validTypes = ["IMAGE", "VIDEO", "LINK"] as const;
      if (!validTypes.includes(mediaType as typeof validTypes[number])) {
        res.status(400).json({ error: "Invalid mediaType" });
        return;
      }

      const days = parseInt(totalDays, 10);
      if (isNaN(days) || days < 1) {
        res.status(400).json({ error: "Invalid totalDays" });
        return;
      }

      const settings = await getSettings();
      const minDays = settings.minDays;
      const maxDays = settings.maxDays;
      if (days < minDays || days > maxDays) {
        res.status(400).json({ error: `Days must be between ${minDays} and ${maxDays}` });
        return;
      }

      if ((mediaType === "IMAGE" || mediaType === "VIDEO") && !req.file) {
        res.status(400).json({ error: "File is required for image and video advertisements" });
        return;
      }

      if (mediaType === "LINK" && !externalLink) {
        res.status(400).json({ error: "externalLink is required for link advertisements" });
        return;
      }

      const feePerDay = parseFloat(settings.feePerDay ?? "100");
      const totalAmount = (feePerDay * days).toFixed(2);
      const mediaUrl = req.file ? `/uploads/ads/${req.file.filename}` : null;

      const [ad] = await db
        .insert(advertisementsTable)
        .values({
          userId: user.id,
          title,
          description: description || null,
          mediaType: mediaType as "IMAGE" | "VIDEO" | "LINK",
          mediaUrl,
          externalLink: externalLink || null,
          totalDays: days,
          totalAmount,
          status: "PENDING",
        })
        .returning();

      res.status(201).json(ad);
    } catch (err) {
      res.status(500).json({ error: "Failed to create advertisement" });
    }
  }
);

// ─── My Ad Payments ───────────────────────────────────────────────────────────

router.get("/advertisements/payments/mine", requireAuth, async (req, res): Promise<void> => {
  try {
    const user = (req as AuthedRequest).user;
    const payments = await db
      .select({
        id: paymentsTable.id,
        advertisementId: paymentsTable.advertisementId,
        amount: paymentsTable.amount,
        status: paymentsTable.status,
        method: paymentsTable.method,
        phoneNumber: paymentsTable.phoneNumber,
        mpesaReceiptNumber: paymentsTable.mpesaReceiptNumber,
        failureReason: paymentsTable.failureReason,
        createdAt: paymentsTable.createdAt,
        completedAt: paymentsTable.completedAt,
        adTitle: advertisementsTable.title,
        adMediaType: advertisementsTable.mediaType,
      })
      .from(paymentsTable)
      .innerJoin(advertisementsTable, eq(paymentsTable.advertisementId, advertisementsTable.id))
      .where(eq(paymentsTable.userId, user.id))
      .orderBy(desc(paymentsTable.createdAt));
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: "Failed to load payment history" });
  }
});

// ─── Pay for Advertisement (M-Pesa STK Push) ─────────────────────────────────

function getCallbackUrl(req: import("express").Request): string {
  const base = process.env["DARAJA_CALLBACK_BASE_URL"];
  if (base) {
    return base.includes("/api/payments/mpesa/callback")
      ? base.trim()
      : `${base.replace(/\/+$/, "").replace(/\/api\/.*/,"")}/api/payments/mpesa/callback`;
  }
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0].trim()}/api/payments/mpesa/callback`;
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) return `https://${devDomain}/api/payments/mpesa/callback`;
  const host = req.get("host") ?? "localhost";
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  return `${proto}://${host}/api/payments/mpesa/callback`;
}

router.post("/advertisements/:id/pay", requireAuth, async (req, res): Promise<void> => {
  try {
    const user = (req as AuthedRequest).user;
    const adId = parseInt(req.params.id, 10);
    const { phoneNumber } = req.body as { phoneNumber?: string };

    if (!phoneNumber) {
      res.status(400).json({ error: "phoneNumber is required" });
      return;
    }

    const [ad] = await db
      .select()
      .from(advertisementsTable)
      .where(and(eq(advertisementsTable.id, adId), eq(advertisementsTable.userId, user.id)));

    if (!ad) {
      res.status(404).json({ error: "Advertisement not found" });
      return;
    }
    if (ad.isPaid) {
      res.status(400).json({ error: "Advertisement already paid" });
      return;
    }

    let formattedPhone: string;
    try {
      formattedPhone = formatPhone(phoneNumber);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid phone number";
      res.status(400).json({ error: msg });
      return;
    }

    const totalAmount = parseFloat(ad.totalAmount);

    const [payment] = await db
      .insert(paymentsTable)
      .values({
        userId: user.id,
        advertisementId: adId,
        amount: ad.totalAmount,
        status: "PENDING",
        method: "MPESA",
        phoneNumber: formattedPhone,
      })
      .returning();

    let stkResult: Awaited<ReturnType<typeof initiateStkPush>>;
    try {
      stkResult = await initiateStkPush({
        phoneNumber: formattedPhone,
        amount: totalAmount,
        accountReference: `AD-${adId}`,
        transactionDesc: `PESAMATRIX Ad: ${ad.title.substring(0, 20)}`,
        callbackUrl: getCallbackUrl(req),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "STK Push failed";
      logger.error({ err, paymentId: payment.id }, "Ad STK Push failed");
      await db
        .update(paymentsTable)
        .set({ status: "FAILED", failureReason: msg })
        .where(eq(paymentsTable.id, payment.id));
      res.status(502).json({ error: msg });
      return;
    }

    await db
      .update(paymentsTable)
      .set({
        checkoutRequestId: stkResult.CheckoutRequestID,
        merchantRequestId: stkResult.MerchantRequestID,
      })
      .where(eq(paymentsTable.id, payment.id));

    res.json({
      checkoutRequestId: stkResult.CheckoutRequestID,
      merchantRequestId: stkResult.MerchantRequestID,
      paymentId: payment.id,
      message: stkResult.CustomerMessage,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to initiate payment" });
  }
});

// ─── Admin ────────────────────────────────────────────────────────────────────

router.get("/admin/advertisements", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const ads = await db
      .select()
      .from(advertisementsTable)
      .orderBy(desc(advertisementsTable.createdAt));
    res.json(ads);
  } catch (err) {
    res.status(500).json({ error: "Failed to load advertisements" });
  }
});

router.get("/admin/advertisements/settings", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to load settings" });
  }
});

router.post("/admin/advertisements/settings", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { feePerDay, minDays, maxDays } = req.body as {
      feePerDay?: number;
      minDays?: number;
      maxDays?: number;
    };

    if (feePerDay == null || minDays == null || maxDays == null) {
      res.status(400).json({ error: "feePerDay, minDays, and maxDays are required" });
      return;
    }

    const existing = await db.select().from(advertisementSettingsTable).limit(1);
    const now = new Date();

    let settings;
    if (existing.length > 0) {
      const [updated] = await db
        .update(advertisementSettingsTable)
        .set({ feePerDay: String(feePerDay), minDays, maxDays, updatedAt: now })
        .where(eq(advertisementSettingsTable.id, existing[0].id))
        .returning();
      settings = updated;
    } else {
      const [created] = await db
        .insert(advertisementSettingsTable)
        .values({ feePerDay: String(feePerDay), minDays, maxDays })
        .returning();
      settings = created;
    }

    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

router.patch("/admin/advertisements/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const [ad] = await db
      .select()
      .from(advertisementsTable)
      .where(eq(advertisementsTable.id, id));

    if (!ad) {
      res.status(404).json({ error: "Advertisement not found" });
      return;
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + ad.totalDays);

    const [updated] = await db
      .update(advertisementsTable)
      .set({ status: "APPROVED", startDate: now, endDate, updatedAt: now })
      .where(eq(advertisementsTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to approve advertisement" });
  }
});

router.patch("/admin/advertisements/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const now = new Date();
    const [updated] = await db
      .update(advertisementsTable)
      .set({ status: "REJECTED", updatedAt: now })
      .where(eq(advertisementsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Advertisement not found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to reject advertisement" });
  }
});

router.patch("/admin/advertisements/:id/pause", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const [ad] = await db
      .select()
      .from(advertisementsTable)
      .where(eq(advertisementsTable.id, id));

    if (!ad) {
      res.status(404).json({ error: "Advertisement not found" });
      return;
    }

    const newStatus = ad.status === "PAUSED" ? "APPROVED" : "PAUSED";
    const now = new Date();
    const [updated] = await db
      .update(advertisementsTable)
      .set({ status: newStatus, updatedAt: now })
      .where(eq(advertisementsTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to toggle pause" });
  }
});

router.delete("/admin/advertisements/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const [ad] = await db
      .select()
      .from(advertisementsTable)
      .where(eq(advertisementsTable.id, id));

    if (ad?.mediaUrl) {
      const filePath = path.resolve("public", ad.mediaUrl.replace(/^\//, ""));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await db.delete(advertisementsTable).where(eq(advertisementsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete advertisement" });
  }
});

export default router;
