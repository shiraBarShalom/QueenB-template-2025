const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
require("../config/env");

if (process.env.MIGRATION_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
}

const db = require("../db");

const migrationsDirectory = path.join(__dirname, "..", "db", "migrations");

async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const fileNames = (await fs.readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of fileNames) {
    const sql = await fs.readFile(path.join(migrationsDirectory, name), "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    const applied = await db.query(
      "SELECT checksum FROM schema_migrations WHERE name = $1",
      [name]
    );

    if (applied.rowCount > 0) {
      if (applied.rows[0].checksum !== checksum) {
        throw new Error(`Applied migration was modified: ${name}`);
      }
      console.log(`Already applied: ${name}`);
      continue;
    }

    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [name, checksum]
      );
      await client.query("COMMIT");
      console.log(`Applied: ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

migrate()
  .catch((error) => {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
