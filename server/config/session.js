// ============================================================================
// Session middleware for the authentication feature.
// ============================================================================
// Ported from feature/mentorme-login-page (server/index.js there) and adapted
// to this branch:
//   - the session STORE is a small dedicated `pg` Pool (connect-pg-simple),
//     NOT Prisma. The `session` table is infrastructure, not domain data, so it
//     is deliberately not a Prisma model — connect-pg-simple creates and prunes
//     it itself (createTableIfMissing).
//   - Prisma keeps its own pool via ../prismaClient; this pool is separate and
//     only used for session rows.
//   - SESSION_SECRET is read leniently: in development we fall back to a fixed
//     dev secret with a warning instead of throwing, so `npm start` / `npm run
//     dev` behave exactly like before for anyone who has not set it yet.
//
// Cookie hardening (httpOnly, sameSite=strict, rolling, 8h) and the
// regenerate-on-login flow in routes/auth.js are kept from the incoming branch.
// ============================================================================

const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");

const isProd = process.env.NODE_ENV === "production";

const DEV_SECRET = "mentorme-dev-only-session-secret-change-me-0123456789";

function resolveSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32 && !secret.startsWith("replace_")) {
    return secret;
  }
  if (isProd) {
    throw new Error(
      "SESSION_SECRET must be a generated secret of at least 32 characters in production"
    );
  }
  console.warn(
    "[auth] SESSION_SECRET is not set — using an insecure development secret. " +
      "Set SESSION_SECRET in server/.env before deploying."
  );
  return DEV_SECRET;
}

// Dedicated pool for the session store only. Reuses the same DATABASE_URL /
// discrete DB_* variables the rest of the server already relies on.
const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({ connectionString })
  : new Pool({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

pool.on("error", (err) => {
  console.error("[auth] Unexpected error on idle session-store client:", err.message);
});

// The app DB role cannot CREATE tables. Use the existing connect-pg-simple
// table from the SQL migrations instead of trying to create `session`.
const SESSION_TABLE = "user_sessions";

const sessionMiddleware = session({
  name: "mentorme.sid",
  store: new PgSession({
    pool,
    tableName: SESSION_TABLE,
    createTableIfMissing: false,
  }),
  secret: resolveSecret(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    maxAge: 8 * 60 * 60 * 1000,
  },
});

// `pool` is exported so the admin "sign out everywhere" / disable-account
// actions can delete rows from the connect-pg-simple `session` table directly
// (it is infra, not a Prisma model).
module.exports = {
  sessionMiddleware,
  sessionCookieName: "mentorme.sid",
  sessionPool: pool,
  sessionTableName: SESSION_TABLE,
};
