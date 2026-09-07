const db = require("../db");

async function verifyMigration() {
  const columns = await db.query(
    `SELECT column_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users'
     ORDER BY ordinal_position`
  );
  const security = await db.query(
    `SELECT
       COUNT(*)::int AS users,
       COUNT(*) FILTER (WHERE password_hash LIKE '$argon2id$%')::int AS argon2_hashes
     FROM users`
  );
  const tables = await db.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
     ORDER BY table_name`
  );
  const plaintextColumn = columns.rows.some(
    (column) => column.column_name === "password"
  );
  const requiredColumns = [
    "id",
    "email",
    "password_hash",
    "display_name",
    "is_admin",
    "is_active",
  ];
  const missingColumns = requiredColumns.filter(
    (name) => !columns.rows.some((column) => column.column_name === name)
  );
  const requiredTables = [
    "user_profiles",
    "mentor_profiles",
    "user_sessions",
    "user_roles",
    "password_reset_tokens",
  ];
  const tableNames = tables.rows.map((row) => row.table_name);
  const missingTables = requiredTables.filter((name) => !tableNames.includes(name));

  if (plaintextColumn) throw new Error("Plaintext password column still exists");
  if (missingColumns.length > 0) {
    throw new Error(`Missing user columns: ${missingColumns.join(", ")}`);
  }
  if (missingTables.length > 0) {
    throw new Error(`Missing tables: ${missingTables.join(", ")}`);
  }
  if (security.rows[0].users !== security.rows[0].argon2_hashes) {
    throw new Error("Not every user has an Argon2id password hash");
  }

  console.log("Users:", security.rows[0].users);
  console.log("Argon2id hashes:", security.rows[0].argon2_hashes);
  console.log("Tables:", tableNames.join(", "));
  console.log("Migration verification passed.");
}

verifyMigration()
  .catch((error) => {
    console.error(`Migration verification failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
