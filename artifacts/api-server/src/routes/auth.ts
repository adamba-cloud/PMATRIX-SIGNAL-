import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  LoginBody,
  RegisterBody,
  ChangePasswordBody,
} from "@workspace/api-zod";
import {
  hashPassword,
  comparePassword,
  signToken,
  requireAuth,
} from "../lib/auth";
import { generateReferralCode, applyReferralReward } from "../lib/referrals";

const router = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (user.suspended) {
    res.status(403).json({ error: "Your account has been suspended. Please contact support." });
    return;
  }

  const token = signToken({ userId: user.id, role: user.role });
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password, name } = parsed.data;
  const referralCodeUsed = (req.body.referralCode as string | undefined)?.trim().toUpperCase();

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  // Validate referral code if provided
  let referrer: { id: number } | null = null;
  if (referralCodeUsed) {
    const [found] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.referralCode, referralCodeUsed));
    if (found) referrer = found;
  }

  // Generate a unique referral code for the new user
  let newCode = generateReferralCode();
  let attempts = 0;
  while (attempts < 5) {
    const [conflict] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, newCode));
    if (!conflict) break;
    newCode = generateReferralCode();
    attempts++;
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    name,
    passwordHash,
    role: "USER",
    mustChangePassword: false,
    referralCode: newCode,
  }).returning();

  // Apply referral rewards asynchronously (don't block registration)
  if (referrer) {
    applyReferralReward(referrer.id, user.id).catch(() => {});
  }

  const token = signToken({ userId: user.id, role: user.role });
  res.status(201).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      referralCode: user.referralCode,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    whatsappNumber: user.whatsappNumber,
    referralCode: user.referralCode,
    createdAt: user.createdAt.toISOString(),
  });
});

router.patch("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const { whatsappNumber } = req.body as { whatsappNumber?: string | null };
  const cleaned = whatsappNumber ? whatsappNumber.replace(/\D/g, "") : null;
  const [updated] = await db
    .update(usersTable)
    .set({ whatsappNumber: cleaned || null })
    .where(eq(usersTable.id, req.userId!))
    .returning();
  res.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    whatsappNumber: updated.whatsappNumber,
    referralCode: updated.referralCode,
    mustChangePassword: updated.mustChangePassword,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  const [updated] = await db.update(usersTable)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  const token = signToken({ userId: updated.id, role: updated.role });
  res.json({
    token,
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      mustChangePassword: updated.mustChangePassword,
      createdAt: updated.createdAt.toISOString(),
    },
  });
});

export default router;
