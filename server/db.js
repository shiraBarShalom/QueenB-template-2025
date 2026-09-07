const { Pool } = require("pg");
const { getDatabaseConfig } = require("./config/env");

const pool = new Pool(getDatabaseConfig());

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client", err);
});

async function checkConnection() {
  const result = await pool.query("SELECT NOW() AS database_time");
  return result.rows[0];
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  checkConnection,
  close: () => pool.end(),
  pool,
};
