import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logger } from "./logger";

const PRIMARY_ADMIN_EMAIL = "craigphilip761@gmail.com";
const PRIMARY_ADMIN_NAME = "Philip Craig";
const TEMP_PASSWORD = "Pesa@2026!";

export async function seedAdminUser(): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: usersTable.id, role: usersTable.role, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.email, PRIMARY_ADMIN_EMAIL))
      .limit(1);

    if (existing) {
      if (existing.role !== "ADMIN") {
        await db
          .update(usersTable)
          .set({ role: "ADMIN" })
          .where(eq(usersTable.id, existing.id));
        logger.info({ email: PRIMARY_ADMIN_EMAIL }, "Promoted existing user to ADMIN");
      }
      return;
    }

    const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 10);
    await db.insert(usersTable).values({
      email: PRIMARY_ADMIN_EMAIL,
      name: PRIMARY_ADMIN_NAME,
      passwordHash,
      role: "ADMIN",
      mustChangePassword: true,
    });

    logger.info(
      { email: PRIMARY_ADMIN_EMAIL },
      `Admin account created — password: ${TEMP_PASSWORD} (must change on first login)`
    );
  } catch (err) {
    logger.error({ err }, "Failed to seed admin user");
  }
}
