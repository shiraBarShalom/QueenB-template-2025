const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const db = require("./db");
const env = require("./config/env");
const { createMutationGuard } = require("./middleware/requestSecurity");
const { sendError } = require("./utils/responseHandler");

const app = express();

if (env.trustProxy) {
  app.set("trust proxy", 1);
}

app.use(helmet());
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  })
);
app.use(morgan("combined"));
app.use(express.json());
const allowedMutationOrigins = [env.clientOrigin];
if (env.nodeEnv !== "production") {
  allowedMutationOrigins.push(
    `http://localhost:${env.port}`,
    `http://127.0.0.1:${env.port}`
  );
}
app.use(
  createMutationGuard(allowedMutationOrigins, {
    requireOrigin: env.nodeEnv === "production",
  })
);
app.use(
  session({
    name: "mentorme.sid",
    store: new PgSession({
      pool: db.pool,
      tableName: "user_sessions",
      createTableIfMissing: false,
    }),
    secret: env.getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: env.nodeEnv === "production",
      sameSite: "strict",
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);

// Routes (one file per domain, one dev per file — see README for ownership)
app.use("/api/users", require("./routes/users"));           // Domain 1: Auth & Profiles
app.use("/api/mentors", require("./routes/mentors"));       // Domain 2: Discovery & Requests
app.use("/api/requests", require("./routes/scheduling"));   // Domain 3: Scheduling & Statuses

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    message: "MentorMe Server is running!",
    timestamp: new Date().toISOString(),
    status: "healthy",
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({ message: "Welcome to MentorMe API" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);
  return sendError(res, "Something went wrong", 500);
});

// 404 handler
app.use("*", (req, res) => {
  return sendError(res, "Route not found", 404);
});

async function start() {
  await db.checkConnection();
  app.listen(env.port, () => {
    console.log(`MentorMe server is running on port ${env.port}`);
    console.log(`Health check: http://localhost:${env.port}/api/health`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Server failed to start:", error.message);
    process.exitCode = 1;
  });
}

module.exports = app;
