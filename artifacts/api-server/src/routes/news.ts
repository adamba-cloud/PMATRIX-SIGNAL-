import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, newsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import type { Request } from "express";

const router = Router();

const uploadDir = path.resolve("public/uploads/media");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.get("/news", requireAuth, async (_req, res): Promise<void> => {
  const items = await db
    .select()
    .from(newsTable)
    .where(eq(newsTable.published, true))
    .orderBy(desc(newsTable.createdAt));
  res.json(items);
});

router.get("/admin/news", requireAdmin, async (_req, res): Promise<void> => {
  const items = await db.select().from(newsTable).orderBy(desc(newsTable.createdAt));
  res.json(items);
});

router.get("/news/:id", requireAuth, async (req: Request, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [item] = await db.select().from(newsTable).where(eq(newsTable.id, id));
  if (!item || (!item.published && req.userRole !== "ADMIN")) {
    res.status(404).json({ error: "News not found" });
    return;
  }
  res.json(item);
});

router.post(
  "/admin/news",
  requireAdmin,
  imageUpload.single("featuredImage"),
  async (req: Request, res): Promise<void> => {
    const { title, summary, content, published, publishDate } = req.body as {
      title?: string;
      summary?: string;
      content?: string;
      published?: string;
      publishDate?: string;
    };
    if (!title || !summary || !content) {
      res.status(400).json({ error: "title, summary and content are required" });
      return;
    }
    const featuredImageUrl = req.file ? `/uploads/media/${req.file.filename}` : null;
    const [item] = await db
      .insert(newsTable)
      .values({
        title,
        summary,
        content,
        featuredImageUrl,
        published: published === "true",
        publishDate: publishDate ? new Date(publishDate) : null,
      })
      .returning();
    res.status(201).json(item);
  },
);

router.put(
  "/admin/news/:id",
  requireAdmin,
  imageUpload.single("featuredImage"),
  async (req: Request, res): Promise<void> => {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(newsTable).where(eq(newsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "News not found" });
      return;
    }
    const { title, summary, content, published, publishDate } = req.body as {
      title?: string;
      summary?: string;
      content?: string;
      published?: string;
      publishDate?: string;
    };
    const featuredImageUrl = req.file
      ? `/uploads/media/${req.file.filename}`
      : existing.featuredImageUrl;
    const [item] = await db
      .update(newsTable)
      .set({
        title: title ?? existing.title,
        summary: summary ?? existing.summary,
        content: content ?? existing.content,
        featuredImageUrl,
        published: published !== undefined ? published === "true" : existing.published,
        publishDate: publishDate ? new Date(publishDate) : existing.publishDate,
        updatedAt: new Date(),
      })
      .where(eq(newsTable.id, id))
      .returning();
    res.json(item);
  },
);

router.delete("/admin/news/:id", requireAdmin, async (req: Request, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [item] = await db.select().from(newsTable).where(eq(newsTable.id, id));
  if (!item) {
    res.status(404).json({ error: "News not found" });
    return;
  }
  if (item.featuredImageUrl) {
    const filePath = path.resolve(`public${item.featuredImageUrl}`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  await db.delete(newsTable).where(eq(newsTable.id, id));
  res.json({ success: true });
});

export default router;
