import { Router } from "express";
import { db, announcementsTable } from "@workspace/db";
import { eq, and, or, isNull, gt, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/announcements/active", requireAuth, async (_req, res): Promise<void> => {
  const now = new Date();
  const announcements = await db
    .select()
    .from(announcementsTable)
    .where(
      and(
        eq(announcementsTable.active, true),
        or(isNull(announcementsTable.expiresAt), gt(announcementsTable.expiresAt, now))
      )
    )
    .orderBy(desc(announcementsTable.createdAt));
  res.json(announcements);
});

router.get("/admin/announcements", requireAdmin, async (_req, res): Promise<void> => {
  const announcements = await db
    .select()
    .from(announcementsTable)
    .orderBy(desc(announcementsTable.createdAt));
  res.json(announcements);
});

router.post("/admin/announcements", requireAdmin, async (req, res): Promise<void> => {
  const { title, message, type, expiresAt } = req.body as {
    title?: string;
    message?: string;
    type?: string;
    expiresAt?: string;
  };

  if (!title || !message) {
    res.status(400).json({ error: "title and message are required" });
    return;
  }

  const validType = (["INFO", "WARNING", "SUCCESS", "CRITICAL"] as const).includes(
    type as "INFO" | "WARNING" | "SUCCESS" | "CRITICAL"
  )
    ? (type as "INFO" | "WARNING" | "SUCCESS" | "CRITICAL")
    : "INFO";

  const [created] = await db
    .insert(announcementsTable)
    .values({
      title,
      message,
      type: validType,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    })
    .returning();

  res.status(201).json(created);
});

router.patch("/admin/announcements/:id/toggle", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [ann] = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.id, id));

  if (!ann) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }

  const [updated] = await db
    .update(announcementsTable)
    .set({ active: !ann.active })
    .where(eq(announcementsTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/admin/announcements/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(announcementsTable).where(eq(announcementsTable.id, id));
  res.json({ ok: true });
});

export default router;
