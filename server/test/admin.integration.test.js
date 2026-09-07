const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  "admin API integration",
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
    const { createAdmin } = require("../services/usersService");
    t.after(() => db.close());

    await db.query("TRUNCATE TABLE users CASCADE");

    const memberAgent = request.agent(app);
    const member = await memberAgent
      .post("/api/users/register")
      .send({
        displayName: "Member",
        email: "member@example.com",
        password: "member password long",
      })
      .expect(201);

    await createAdmin({
      displayName: "Owner",
      email: "owner@example.com",
      password: "owner password long",
    });
    const adminAgent = request.agent(app);
    await adminAgent
      .post("/api/users/login")
      .send({ email: "owner@example.com", password: "owner password long" })
      .expect(200);

    await t.test("ordinary members cannot list users", async () => {
      await memberAgent.get("/api/admin/users").expect(403);
    });

    await t.test("admins can list users without password hashes", async () => {
      const response = await adminAgent.get("/api/admin/users").expect(200);
      assert.equal(response.body.data.users.some((user) => user.passwordHash), false);
      assert.equal(
        response.body.data.users.some((user) => user.email === "member@example.com"),
        true
      );
    });

    await t.test("admins persist roles and cannot demote themselves", async () => {
      const updated = await adminAgent
        .patch(`/api/admin/users/${member.body.data.id}`)
        .send({ roles: ["MENTEE", "MENTOR"], isAdmin: true })
        .expect(200);
      assert.deepEqual(updated.body.data.roles, ["MENTEE", "MENTOR"]);

      const ownerId = (await adminAgent.get("/api/admin/me")).body.data.id;
      const selfDemote = await adminAgent
        .patch(`/api/admin/users/${ownerId}`)
        .send({ isAdmin: false });
      assert.equal(selfDemote.status, 400);
    });

    await t.test("disabled members cannot sign in", async () => {
      await adminAgent
        .patch(`/api/admin/users/${member.body.data.id}`)
        .send({ isAdmin: false, isActive: false })
        .expect(200);

      const login = await request(app)
        .post("/api/users/login")
        .send({ email: "member@example.com", password: "member password long" })
        .expect(401);
      assert.equal(login.body.message, "Invalid email or password");
    });

    await t.test("the last administrator cannot be demoted", async () => {
      const users = await adminAgent.get("/api/admin/users").expect(200);
      const otherAdmins = users.body.data.users.filter(
        (user) => user.isAdmin && user.email !== "owner@example.com"
      );
      for (const extra of otherAdmins) {
        await adminAgent.patch(`/api/admin/users/${extra.id}`).send({ isAdmin: false });
      }
      const ownerId = (await adminAgent.get("/api/users/me")).body.data.id;
      const response = await adminAgent
        .patch(`/api/admin/users/${ownerId}`)
        .send({ isAdmin: false });
      assert.equal(response.status, 400);
    });
  }
);
