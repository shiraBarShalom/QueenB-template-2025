const { Pool } = require("pg");
require("dotenv").config();

// Shared connection pool. Import this wherever you need to run a query:
//   const db = require("../db");
//   const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client", err);
  process.exit(1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
