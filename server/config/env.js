const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DB_SSL === "true"
          ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" }
          : false,
    };
  }

  const databaseVariables = ["DB_NAME", "DB_USER", "DB_PASSWORD"];
  const missing = databaseVariables.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Set DATABASE_URL (recommended) or DB_NAME, DB_USER, and DB_PASSWORD. Missing: ${missing.join(", ")}`
    );
  }

  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl:
      process.env.DB_SSL === "true"
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" }
        : false,
  };
}

function getSessionSecret() {
  const secret = required("SESSION_SECRET");
  if (secret.length < 32 || secret.startsWith("replace_")) {
    throw new Error("SESSION_SECRET must be a generated secret of at least 32 characters");
  }
  return secret;
}

function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  if ((process.env.NODE_ENV || "development") === "production" && !apiKey) {
    throw new Error("Missing required environment variable: RESEND_API_KEY");
  }
  return {
    apiKey: apiKey || "",
    from: process.env.RESEND_FROM_EMAIL || "MentorMe <onboarding@resend.dev>",
    resetTtlMinutes: Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 60),
  };
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  trustProxy: process.env.TRUST_PROXY === "true",
  getDatabaseConfig,
  getSessionSecret,
  getEmailConfig,
};
