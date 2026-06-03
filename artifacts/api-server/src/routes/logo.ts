import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, systemConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

const logoDir = path.resolve("public/uploads/logo");
if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, logoDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    cb(null, `logo${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

const LOGO_KEY = "logo_url";

async function getLogoUrl(): Promise<string | null> {
  const [row] = await db
    .select({ value: systemConfigTable.value })
    .from(systemConfigTable)
    .where(eq(systemConfigTable.key, LOGO_KEY));
  return row?.value ?? null;
}

router.get("/logo", async (_req, res): Promise<void> => {
  const url = await getLogoUrl();
  res.json({ url });
});

router.post(
  "/admin/logo",
  requireAdmin,
  upload.single("logo"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "Logo file is required" });
      return;
    }
    const fileUrl = `/uploads/logo/${req.file.filename}`;

    const existing = await getLogoUrl();
    if (existing) {
      await db
        .update(systemConfigTable)
        .set({ value: fileUrl })
        .where(eq(systemConfigTable.key, LOGO_KEY));
    } else {
      await db.insert(systemConfigTable).values({ key: LOGO_KEY, value: fileUrl });
    }

    res.json({ url: fileUrl });
  },
);

router.delete("/admin/logo", requireAdmin, async (_req, res): Promise<void> => {
  const url = await getLogoUrl();
  if (url) {
    const filePath = path.resolve(`public${url}`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await db.delete(systemConfigTable).where(eq(systemConfigTable.key, LOGO_KEY));
  }
  res.json({ success: true });
});

export default router;
