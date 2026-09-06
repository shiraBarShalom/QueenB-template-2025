const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan("combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes (one file per domain)
app.use("/api/users", require("./routes/users"));           // users: create / list / view / edit
app.use("/api/mentors", require("./routes/mentors"));       // mentors: onboarding + discovery
app.use("/api", require("./routes/requests"));              // mentoring requests: /api/requests/* + /api/mentees/:userId/requests

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
