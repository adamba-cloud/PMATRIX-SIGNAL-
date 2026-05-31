import { Router } from "express";
import { randomBytes } from "crypto";
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
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/mailer";

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

  if (!user.emailVerified) {
    res.status(403).json({ error: "EMAIL_NOT_VERIFIED", email: user.email });
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

  let referrer: { id: number } | null = null;
  if (referralCodeUsed) {
    const [found] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.referralCode, referralCodeUsed));
    if (found) referrer = found;
  }

  let newCode = generateReferralCode();
  let attempts = 0;
  while (attempts < 5) {
    const [conflict] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, newCode));
    if (!conflict) break;
    newCode = generateReferralCode();
    attempts++;
  }

  const verificationToken = randomBytes(32).toString("hex");
  const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    name,
    passwordHash,
    role: "USER",
    mustChangePassword: false,
    referralCode: newCode,
    emailVerified: false,
    emailVerificationToken: verificationToken,
    emailVerificationExpiry: verificationExpiry,
  }).returning();

  if (referrer) {
    applyReferralReward(referrer.id, user.id).catch(() => {});
  }

  sendVerificationEmail(user.email, user.name, verificationToken).catch(() => {});

  res.status(201).json({
    requiresVerification: true,
    email: user.email,
  });
});

router.get("/auth/verify-email", async (req, res): Promise<void> => {
  const token = req.query.token as string | undefined;
  if (!token) {
    res.status(400).json({ error: "Missing token" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.emailVerificationToken, token));

  if (!user) {
    res.status(400).json({ error: "Invalid or expired verification link" });
    return;
  }

  if (user.emailVerified) {
    const sessionToken = signToken({ userId: user.id, role: user.role });
    res.json({ alreadyVerified: true, token: sessionToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    return;
  }

  if (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date()) {
    res.status(400).json({ error: "Verification link has expired. Please request a new one." });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ emailVerified: true, emailVerificationToken: null, emailVerificationExpiry: null })
    .where(eq(usersTable.id, user.id))
    .returning();

  const sessionToken = signToken({ userId: updated.id, role: updated.role });
  res.json({
    token: sessionToken,
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

router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!user) {
    res.json({ message: "If that email exists, a new verification link has been sent." });
    return;
  }

  if (user.emailVerified) {
    res.json({ message: "Email already verified. You can log in." });
    return;
  }

  const verificationToken = randomBytes(32).toString("hex");
  const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db
    .update(usersTable)
    .set({ emailVerificationToken: verificationToken, emailVerificationExpiry: verificationExpiry })
    .where(eq(usersTable.id, user.id));

  sendVerificationEmail(user.email, user.name, verificationToken).catch(() => {});

  res.json({ message: "A new verification email has been sent." });
});

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

  // Always respond the same way to prevent email enumeration
  if (!user || !user.emailVerified) {
    res.json({ message: "If that email exists, a reset link has been sent." });
    return;
  }

  const resetToken = randomBytes(32).toString("hex");
  const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db
    .update(usersTable)
    .set({ passwordResetToken: resetToken, passwordResetExpiry: resetExpiry })
    .where(eq(usersTable.id, user.id));

  sendPasswordResetEmail(user.email, user.name, resetToken).catch(() => {});

  res.json({ message: "If that email exists, a reset link has been sent." });
});

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password) {
    res.status(400).json({ error: "Token and new password are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.passwordResetToken, token));

  if (!user) {
    res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });
    return;
  }

  if (user.passwordResetExpiry && user.passwordResetExpiry < new Date()) {
    res.status(400).json({ error: "This reset link has expired. Please request a new one." });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash, passwordResetToken: null, passwordResetExpiry: null, mustChangePassword: false })
    .where(eq(usersTable.id, user.id))
    .returning();

  const sessionToken = signToken({ userId: updated.id, role: updated.role });
  res.json({
    token: sessionToken,
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
