import type { Request, Response, NextFunction } from "express";
import { db, subscriptionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export async function requireSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (req.userRole === "ADMIN") {
    next();
    return;
  }

  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [active] = await db
    .select({ id: subscriptionsTable.id })
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.userId, req.userId),
        eq(subscriptionsTable.status, "ACTIVE")
      )
    )
    .limit(1);

  if (!active) {
    res.status(403).json({ error: "Active subscription required", subscriptionRequired: true });
    return;
  }

  next();
}
