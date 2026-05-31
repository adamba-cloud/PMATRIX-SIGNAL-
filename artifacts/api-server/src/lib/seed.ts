import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logger } from "./logger";

export async function seedAdminUser(): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "ADMIN"))
      .limit(1);

    if (existing) return;

    const passwordHash = await bcrypt.hash("Admin@1234", 10);
    await db.insert(usersTable).values({
      email: "admin@pesamatrix.com",
      name: "Administrator",
      passwordHash,
      role: "ADMIN",
      mustChangePassword: true,
    });

    logger.info("Default admin account created — email: admin@pesamatrix.com | password: Admin@1234 (must change on first login)");
  } catch (err) {
    logger.error({ err }, "Failed to seed admin user");
  }
}
