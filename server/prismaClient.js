// ============================================================================
// Single shared PrismaClient for the whole server.
// ============================================================================
// Import this everywhere you need DB access:
//   const prisma = require("./prismaClient");
//
// Why one instance:
//   Each `new PrismaClient()` opens its own connection pool. Instantiating one
//   per route file quickly exhausts Postgres' connection limit and is the
//   documented Prisma anti-pattern.
//
// Why the globalThis cache:
//   `nodemon` reloads this module on every file change. Without the cache each
//   reload would leak another PrismaClient + pool until the DB refuses
//   connections. In production the process starts once, so the plain instance
//   is used.
// ============================================================================

const { PrismaClient } = require("@prisma/client");

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__prisma ||
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}

module.exports = prisma;
