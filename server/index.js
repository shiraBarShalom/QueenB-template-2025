const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const { sessionMiddleware } = require("./config/session");

const app = express();
const PORT = process.env.PORT || 5000;

// In production the client is typically served from the same origin; behind a
// proxy we still need this so `secure` session cookies are emitted.
if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

// Middleware
app.use(helmet());
// `credentials: true` + a reflected origin lets the browser send the
// mentorme.sid session cookie on cross-origin API calls (dev CRA proxy and
// same-origin production are unaffected). Restrict with CLIENT_ORIGIN if set.
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || true,
    credentials: true,
  })
);
app.use(morgan("combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Server-side sessions for the authentication feature (login / register / me /
// logout). Store table is managed by connect-pg-simple, not Prisma.
app.use(sessionMiddleware);

// Routes (one file per domain)
// Auth routes are mounted on the same path as the users CRUD router but FIRST,
// so /api/users/{register,login,logout,me} resolve here and everything else
// falls through to the existing Prisma-backed users router below untouched.
app.use("/api/users", require("./routes/auth"));            // auth: register / login / logout / me
app.use("/api/users", require("./routes/users"));           // users: create / list / view / edit
app.use("/api/mentors", require("./routes/mentors"));       // mentors: onboarding + discovery
app.use("/api/admin", require("./routes/admin"));           // admin dashboard: users + meeting report/calendar/alerts (Prisma; requireAdmin)
app.use("/api", require("./routes/requests"));              // mentoring requests: /api/requests/* + /api/mentees/:userId/requests
app.use("/api", require("./routes/notifications"));         // in-app notifications: /api/users/:userId/notifications/*
app.use("/api", require("./routes/postMeeting"));           // post-meeting flow: /api/meetings/:meetingId/feedback

// Scheduling state machine. Mounted AFTER routes/requests.js: its sub-paths
// (/:requestId/propose-slots, /select-slot, /cannot-attend, /withdraw, /cancel)
// do not collide with the exact paths requests.js owns (/requests,
// /requests/:id, /requests/:id/reject), so requests.js falls through to here.
app.use("/api/requests", require("./routes/scheduling"));   // scheduling: status transitions on a MentoringRequest

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    message: "QueenB Server is running!",
    timestamp: new Date().toISOString(),
    status: "healthy",
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({ message: "Welcome to QueenB API" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📱 Health check: http://localhost:${PORT}/api/health`);
});
