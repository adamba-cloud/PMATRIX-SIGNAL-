import { Router } from "express";
import { db, resourceLinksTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import type { Request } from "express";

const router = Router();

router.get("/resources", requireAuth, async (_req, res): Promise<void> => {
  const items = await db
    .select()
    .from(resourceLinksTable)
    .orderBy(desc(resourceLinksTable.createdAt));
  res.json(items);
});

router.post("/admin/resources", requireAdmin, async (req: Request, res): Promise<void> => {
  const { title, description, url, linkType } = req.body as {
    title?: string;
    description?: string;
    url?: string;
    linkType?: string;
  };
  if (!title || !url) {
    res.status(400).json({ error: "title and url are required" });
    return;
  }
  const validTypes = ["YOUTUBE", "WEBSITE", "TELEGRAM", "EDUCATIONAL"] as const;
  const resolvedType = (validTypes.includes(linkType as typeof validTypes[number]) ? linkType : "WEBSITE") as typeof validTypes[number];
  const [item] = await db
    .insert(resourceLinksTable)
    .values({ title, description: description ?? null, url, linkType: resolvedType })
    .returning();
  res.status(201).json(item);
});

router.put("/admin/resources/:id", requireAdmin, async (req: Request, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(resourceLinksTable).where(eq(resourceLinksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  const { title, description, url, linkType } = req.body as {
    title?: string;
    description?: string;
    url?: string;
    linkType?: string;
  };
  const validTypes = ["YOUTUBE", "WEBSITE", "TELEGRAM", "EDUCATIONAL"] as const;
  const resolvedType = linkType && validTypes.includes(linkType as typeof validTypes[number])
    ? (linkType as typeof validTypes[number])
    : existing.linkType;
  const [item] = await db
    .update(resourceLinksTable)
    .set({
      title: title ?? existing.title,
      description: description ?? existing.description,
      url: url ?? existing.url,
      linkType: resolvedType,
      updatedAt: new Date(),
    })
    .where(eq(resourceLinksTable.id, id))
    .returning();
  res.json(item);
});

router.delete("/admin/resources/:id", requireAdmin, async (req: Request, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [item] = await db.select().from(resourceLinksTable).where(eq(resourceLinksTable.id, id));
  if (!item) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  await db.delete(resourceLinksTable).where(eq(resourceLinksTable.id, id));
  res.json({ success: true });
});

export default router;
