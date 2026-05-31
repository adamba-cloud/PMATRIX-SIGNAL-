import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const ADMIN_EMAIL = "craigphilip761@gmail.com";
const ADMIN_NAME = "Philip Craig";
const TEMP_PASSWORD = "Pesa@2026!";

async function run() {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT id, email, role FROM users WHERE email = $1`,
      [ADMIN_EMAIL]
    );

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      if (user.role === "ADMIN") {
        console.log(`✅ Admin already exists: ${ADMIN_EMAIL} (id=${user.id})`);
        console.log("Updating password to temporary password...");
        const hash = await bcrypt.hash(TEMP_PASSWORD, 10);
        await client.query(
          `UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2`,
          [hash, user.id]
        );
        console.log("✅ Password reset done.");
      } else {
        console.log(`User exists but is not ADMIN — promoting to ADMIN...`);
        const hash = await bcrypt.hash(TEMP_PASSWORD, 10);
        await client.query(
          `UPDATE users SET role = 'ADMIN', password_hash = $1, must_change_password = true WHERE id = $2`,
          [hash, user.id]
        );
        console.log(`✅ Promoted ${ADMIN_EMAIL} to ADMIN and reset password.`);
      }
    } else {
      console.log(`Creating new admin user: ${ADMIN_EMAIL}`);
      const hash = await bcrypt.hash(TEMP_PASSWORD, 10);
      const result = await client.query(
        `INSERT INTO users (email, name, password_hash, role, must_change_password, suspended)
         VALUES ($1, $2, $3, 'ADMIN', true, false)
         RETURNING id`,
        [ADMIN_EMAIL, ADMIN_NAME, hash]
      );
      console.log(`✅ Admin created with id=${result.rows[0].id}`);
    }

    console.log("\n--- Login credentials ---");
    console.log(`Email:    ${ADMIN_EMAIL}`);
    console.log(`Password: ${TEMP_PASSWORD}`);
    console.log("⚠️  You will be prompted to change your password on first login.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
