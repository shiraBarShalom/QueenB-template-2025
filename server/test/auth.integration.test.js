const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  "authentication and profile API integration",
  { skip: !testDatabaseUrl },
  async (t) => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.SESSION_SECRET = "test-only-session-secret-with-more-than-32-characters";
    process.env.CLIENT_ORIGIN = "http://localhost:3000";

    execFileSync(process.execPath, ["scripts/migrate.js"], {
      cwd: require("node:path").join(__dirname, ".."),
      env: process.env,
      stdio: "inherit",
    });

    const request = require("supertest");
    const app = require("../index");
    const db = require("../db");
    const { createAdmin } = require("../services/usersService");
    t.after(() => db.close());

    await db.query("TRUNCATE TABLE users CASCADE");

    await t.test("registers safely and stores an Argon2id hash", async () => {
      const injectionText = "Robert'); DROP TABLE users;--";
      const agent = request.agent(app);
      const response = await agent
        .post("/api/users/register")
        .send({
          displayName: injectionText,
          email: "robert@example.com",
          password: "correct horse battery staple",
        })
        .expect(201);

      assert.equal(response.body.data.displayName, injectionText);
      assert.equal(response.body.data.passwordHash, undefined);

      const stored = await db.query(
        "SELECT password_hash FROM users WHERE email = $1",
        ["robert@example.com"]
      );
      assert.match(stored.rows[0].password_hash, /^\$argon2id\$/);
      assert.notEqual(stored.rows[0].password_hash, "correct horse battery staple");
      const userCount = await db.query("SELECT COUNT(*) AS count FROM users");
      assert.equal(Number(userCount.rows[0].count), 1);

      await agent.get("/api/users/me").expect(200);
      await agent.post("/api/users/logout").send({}).expect(200);
      await agent.get("/api/users/me").expect(401);
    });

    await t.test("rejects duplicate registration and invalid login generically", async () => {
      await request(app)
        .post("/api/users/register")
        .send({
          displayName: "Duplicate",
          email: "ROBERT@example.com",
          password: "another sufficiently long password",
        })
        .expect(409);

      const response = await request(app)
        .post("/api/users/login")
        .send({ email: "missing@example.com", password: "wrong password" })
        .expect(401);
      assert.equal(response.body.message, "Invalid email or password");
    });

    await t.test("updates only the signed-in user's profiles", async () => {
      const agent = request.agent(app);
      await agent
        .post("/api/users/login")
        .send({
          email: "robert@example.com",
          password: "correct horse battery staple",
        })
        .expect(200);

      const profile = await agent
        .patch("/api/users/me/profile")
        .send({
          background: "Backend engineer and community member",
          linkedinUrl: "https://www.linkedin.com/in/robert",
          yearsOfExperience: 5,
          programmingLanguages: ["JavaScript", "SQL"],
        })
        .expect(200);
      assert.equal(profile.body.data.profile.yearsOfExperience, 5);

      const mentor = await agent
        .patch("/api/users/me/mentor-profile")
        .send({
          adviceTopics: ["career planning", "backend engineering"],
          maxMeetings: 4,
          meetingDurationMinutes: 45,
          acceptingRequests: true,
        })
        .expect(200);
      assert.deepEqual(mentor.body.data.mentorProfile.adviceTopics, [
        "career planning",
        "backend engineering",
      ]);

      const roles = await agent
        .put("/api/users/me/roles")
        .send({ roles: ["MENTEE", "MENTOR"] })
        .expect(200);
      assert.deepEqual(roles.body.data.roles, ["MENTEE", "MENTOR"]);

      const finished = await agent
        .patch("/api/users/me/profile")
        .send({ onboardingComplete: true })
        .expect(200);
      assert.equal(finished.body.data.profile.onboardingComplete, true);
    });

    await t.test("denies normal users and allows administrators", async () => {
      const normalAgent = request.agent(app);
      await normalAgent
        .post("/api/users/login")
        .send({
          email: "robert@example.com",
          password: "correct horse battery staple",
        })
        .expect(200);
      await normalAgent.get("/api/users/admin/me").expect(403);

      await createAdmin({
        displayName: "Admin",
        email: "admin@example.com",
        password: "admin password long enough",
      });
      const adminAgent = request.agent(app);
      await adminAgent
        .post("/api/users/login")
        .send({
          email: "admin@example.com",
          password: "admin password long enough",
        })
        .expect(200);
      await adminAgent.get("/api/users/admin/me").expect(200);
    });

    await t.test("rate-limits repeated login attempts", async () => {
      const statuses = [];
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const response = await request(app)
          .post("/api/users/login")
          .send({ email: "attacker@example.com", password: "wrong password" });
        statuses.push(response.status);
      }
      assert.equal(statuses.includes(429), true);
    });
  }
);
