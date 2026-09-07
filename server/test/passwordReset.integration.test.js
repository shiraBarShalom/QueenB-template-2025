const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  "password reset API integration",
  { skip: !testDatabaseUrl },
  async (t) => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.SESSION_SECRET = "test-only-session-secret-with-more-than-32-characters";
    process.env.CLIENT_ORIGIN = "http://localhost:3000";

    execFileSync(process.execPath, ["scripts/migrate.js"], {
      cwd: path.join(__dirname, ".."),
      env: process.env,
      stdio: "inherit",
    });

    const request = require("supertest");
    const app = require("../index");
    const db = require("../db");
    const emailService = require("../services/emailService");
    t.after(() => db.close());

    let capturedToken = null;
    emailService.sendPasswordResetEmail = async ({ token }) => {
      capturedToken = token;
    };

    await db.query("TRUNCATE TABLE users CASCADE");

    const agent = request.agent(app);
    await agent
      .post("/api/users/register")
      .send({
        displayName: "Reset User",
        email: "reset@example.com",
        password: "original password 1",
      })
      .expect(201);

    await t.test("forgot-password does not reveal whether an email exists", async () => {
      const known = await request(app)
        .post("/api/users/forgot-password")
        .send({ email: "reset@example.com" })
        .expect(200);
      const unknown = await request(app)
        .post("/api/users/forgot-password")
        .send({ email: "missing@example.com" })
        .expect(200);
      assert.equal(known.body.message, unknown.body.message);
      assert.ok(capturedToken);
    });

    await t.test("reset password revokes sessions and rejects reused tokens", async () => {
      const token = capturedToken;
      await agent.get("/api/users/me").expect(200);

      await request(app)
        .post("/api/users/reset-password")
        .send({ token, password: "replacement password" })
        .expect(200);

      await agent.get("/api/users/me").expect(401);

      await request(app)
        .post("/api/users/reset-password")
        .send({ token, password: "another replacement" })
        .expect(400);

      await request(app)
        .post("/api/users/login")
        .send({ email: "reset@example.com", password: "replacement password" })
        .expect(200);
    });
  }
);
