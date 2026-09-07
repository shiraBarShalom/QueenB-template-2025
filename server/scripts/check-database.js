const db = require("../db");

db.checkConnection()
  .then(({ database_time: databaseTime }) => {
    console.log(`PostgreSQL connection is healthy (database time: ${databaseTime.toISOString()})`);
  })
  .catch((error) => {
    console.error("PostgreSQL connection failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
