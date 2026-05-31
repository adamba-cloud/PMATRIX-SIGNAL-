import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, ne, and } from "drizzle-orm";
import { requireAdmin, requireAuth, hashPassword } from "../lib/auth";
import { writeAuditLog } from "../lib/audit";
import crypto from "crypto";
import { logger } from "../lib/logger";

const router = Router();

function formatUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    suspended: u.suspended,
    createdAt: u.createdAt.toISOString(),
  };
}

function safeId(raw: string): number | null {
  const id = parseInt(raw, 10);
  return isNaN(id) ? null : id;
}

// ─── List / Get ───────────────────────────────────────────────────────────────

router.get("/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db
    .select()
    .from(usersTable)
    .orderBy(usersTable.createdAt);
  res.json(users.map(formatUser));
});

router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const id = safeId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json(formatUser(user));
});

// ─── Reset Password ───────────────────────────────────────────────────────────

router.post("/admin/users/:id/reset-password", requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid user ID" }); return; }

  // Prevent admins resetting their own password via this route
  if (id === req.userId) {
    res.status(400).json({ error: "Use the change-password flow for your own account" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const tempPassword = crypto.randomBytes(8).toString("hex"); // 16-char hex
  const passwordHash = await hashPassword(tempPassword);

  await db
    .update(usersTable)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(usersTable.id, id));

  logger.info({ adminId: req.userId, targetUserId: id }, "Admin: password reset");
  await writeAuditLog("ADMIN_PASSWORD_RESET", { adminId: req.userId, targetUserId: id, targetEmail: user.email }, "WARN");

  res.json({ tempPassword, mustChangePassword: true });
});

// ─── Force Password Change ────────────────────────────────────────────────────

router.post("/admin/users/:id/force-password-change", requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const [user] = await db
    .update(usersTable)
    .set({ mustChangePassword: true })
    .where(eq(usersTable.id, id))
    .returning();

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  logger.info({ adminId: req.userId, targetUserId: id }, "Admin: forced password change");
  await writeAuditLog("ADMIN_FORCE_PASSWORD_CHANGE", { adminId: req.userId, targetUserId: id }, "INFO");

  res.json(formatUser(user));
});

// ─── Suspend / Unsuspend ──────────────────────────────────────────────────────

router.patch("/admin/users/:id/suspend", requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid user ID" }); return; }

  if (id === req.userId) {
    res.status(400).json({ error: "You cannot suspend your own account" });
    return;
  }

  const suspended = Boolean(req.body.suspended);

  const [user] = await db
    .update(usersTable)
    .set({ suspended })
    .where(eq(usersTable.id, id))
    .returning();

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  logger.info({ adminId: req.userId, targetUserId: id, suspended }, "Admin: user suspension changed");
  await writeAuditLog(
    suspended ? "ADMIN_USER_SUSPENDED" : "ADMIN_USER_UNSUSPENDED",
    { adminId: req.userId, targetUserId: id, targetEmail: user.email },
    "WARN"
  );

  res.json(formatUser(user));
});

// ─── Change Role ──────────────────────────────────────────────────────────────

router.patch("/admin/users/:id/role", requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid user ID" }); return; }

  if (id === req.userId) {
    res.status(400).json({ error: "You cannot change your own role" });
    return;
  }

  const role = req.body.role;
  if (role !== "ADMIN" && role !== "USER") {
    res.status(400).json({ error: "Role must be ADMIN or USER" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ role })
    .where(eq(usersTable.id, id))
    .returning();

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  logger.info({ adminId: req.userId, targetUserId: id, role }, "Admin: role changed");
  await writeAuditLog("ADMIN_ROLE_CHANGED", { adminId: req.userId, targetUserId: id, newRole: role }, "WARN");

  res.json(formatUser(user));
});

// ─── Delete User ──────────────────────────────────────────────────────────────

router.delete("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = safeId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid user ID" }); return; }

  if (id === req.userId) {
    res.status(400).json({ error: "You cannot delete your own account" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  await db.delete(usersTable).where(eq(usersTable.id, id));

  logger.info({ adminId: req.userId, targetUserId: id }, "Admin: user deleted");
  await writeAuditLog("ADMIN_USER_DELETED", { adminId: req.userId, targetUserId: id, targetEmail: user.email }, "ERROR");

  res.status(204).send();
});

// ─── Bulk Actions ─────────────────────────────────────────────────────────────

router.post("/admin/users/bulk", requireAdmin, async (req, res): Promise<void> => {
  const { ids, action } = req.body as { ids: number[]; action: string };

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids must be a non-empty array" });
    return;
  }

  const validActions = ["suspend", "unsuspend", "force-password-change"];
  if (!validActions.includes(action)) {
    res.status(400).json({ error: `action must be one of: ${validActions.join(", ")}` });
    return;
  }

  // Never touch the calling admin's own account in bulk ops
  const safeIds = ids.filter((id) => id !== req.userId);

  const results = await Promise.allSettled(
    safeIds.map(async (id) => {
      if (action === "suspend") {
        await db.update(usersTable).set({ suspended: true }).where(eq(usersTable.id, id));
      } else if (action === "unsuspend") {
        await db.update(usersTable).set({ suspended: false }).where(eq(usersTable.id, id));
      } else if (action === "force-password-change") {
        await db.update(usersTable).set({ mustChangePassword: true }).where(eq(usersTable.id, id));
      }
    })
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  await writeAuditLog("ADMIN_BULK_ACTION", { action, count: safeIds.length, failed, adminId: req.userId }, "WARN");

  res.json({ success: safeIds.length - failed, failed });
});

export default router;
