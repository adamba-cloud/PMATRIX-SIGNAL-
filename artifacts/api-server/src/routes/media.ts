import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, mediaTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import type { AuthedRequest } from "../lib/auth";
import type { Request } from "express";

const router = Router();

const uploadDir = path.resolve("public/uploads/media");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
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

router.get("/media", requireAuth, async (_req, res): Promise<void> => {
  const items = await db.select().from(mediaTable).orderBy(desc(mediaTable.createdAt));
  res.json(items);
});

router.post(
  "/media",
  requireAdmin,
  upload.single("file"),
  async (req: Request, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "File is required" });
      return;
    }
    const { title, description, mediaType } = req.body as {
      title?: string;
      description?: string;
      mediaType?: string;
    };
    if (!title || !mediaType) {
      res.status(400).json({ error: "title and mediaType are required" });
      return;
    }
    const validTypes = ["TRADING_IMAGE", "TRADING_VIDEO", "EDUCATIONAL_VIDEO", "MARKET_ANALYSIS_IMAGE"] as const;
    if (!validTypes.includes(mediaType as typeof validTypes[number])) {
      res.status(400).json({ error: "Invalid mediaType" });
      return;
    }
    const fileUrl = `/uploads/media/${req.file.filename}`;
    const [item] = await db
      .insert(mediaTable)
      .values({
        title,
        description: description ?? null,
        fileUrl,
        mimeType: req.file.mimetype,
        mediaType: mediaType as typeof validTypes[number],
      })
      .returning();
    res.status(201).json(item);
  },
);

router.delete("/media/:id", requireAdmin, async (req: Request, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [item] = await db.select().from(mediaTable).where(eq(mediaTable.id, id));
  if (!item) {
    res.status(404).json({ error: "Media not found" });
    return;
  }
  const filePath = path.resolve(`public${item.fileUrl}`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  await db.delete(mediaTable).where(eq(mediaTable.id, id));
  res.json({ success: true });
});

export default router;
