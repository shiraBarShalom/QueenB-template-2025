require("../config/env");

if (process.env.MIGRATION_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
}

const db = require("../db");
const { hashPassword } = require("../security/passwords");

async function columnExists(client, columnName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'users'
         AND column_name = $1
     ) AS exists`,
    [columnName]
  );
  return result.rows[0].exists;
}

async function upgradeLegacyPasswords() {
  const client = await db.getClient();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE users IN ACCESS EXCLUSIVE MODE");
    await client.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)"
    );

    const hasLegacyPassword = await columnExists(client, "password");
    if (!hasLegacyPassword) {
      const missing = await client.query(
        "SELECT COUNT(*) AS count FROM users WHERE password_hash IS NULL"
      );
      if (Number(missing.rows[0].count) > 0) {
        throw new Error("Some users have no password hash; use a password-reset flow");
      }
      await client.query("COMMIT");
      console.log("No legacy plaintext password column exists; nothing to upgrade.");
      return;
    }

    const users = await client.query(
      `SELECT ctid::text AS row_location, password
       FROM users
       WHERE password_hash IS NULL`
    );

    for (const user of users.rows) {
      if (!user.password) {
        throw new Error("A legacy user has an empty password; migration was rolled back");
      }
      if (user.password.startsWith("$2")) {
        throw new Error(
          "A legacy bcrypt hash was found; use a password reset instead of double-hashing it"
        );
      }

      const passwordHash = user.password.startsWith("$argon2id$")
        ? user.password
        : await hashPassword(user.password);
      await client.query(
        "UPDATE users SET password_hash = $1 WHERE ctid = $2::tid",
        [passwordHash, user.row_location]
      );
    }

    const missing = await client.query(
      "SELECT COUNT(*) AS count FROM users WHERE password_hash IS NULL"
    );
    if (Number(missing.rows[0].count) > 0) {
      throw new Error("Not every legacy password was upgraded; migration was rolled back");
    }

    await client.query("ALTER TABLE users DROP COLUMN password");
    await client.query("COMMIT");
    console.log(`Securely upgraded ${users.rowCount} legacy password(s) to Argon2id.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

upgradeLegacyPasswords()
  .catch((error) => {
    console.error(`Legacy password upgrade failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
