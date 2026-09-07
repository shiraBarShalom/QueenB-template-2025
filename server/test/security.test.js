const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hashPassword,
  verifyPassword,
} = require("../security/passwords");
const { generateResetToken, hashToken } = require("../security/tokens");
const {
  registerSchema,
  profileSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  rolesSchema,
} = require("../validation/users");

test("Argon2id hashes are one-way and verifiable", async () => {
  const password = "correct horse battery staple";
  const hash = await hashPassword(password);

  assert.notEqual(hash, password);
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(hash, password), true);
  assert.equal(await verifyPassword(hash, "wrong password"), false);
});

test("public registration rejects weak passwords and administrator fields", () => {
  const weak = registerSchema.safeParse({
    displayName: "Mentee",
    email: "mentee@example.com",
    password: "short",
  });
  assert.equal(weak.success, false);

  const privilegeEscalation = registerSchema.safeParse({
    displayName: "Mentee",
    email: "mentee@example.com",
    password: "a sufficiently long password",
    isAdmin: true,
  });
  assert.equal(privilegeEscalation.success, false);
});

test("profiles reject unsafe URLs and invalid experience", () => {
  assert.equal(
    profileSchema.safeParse({
      linkedinUrl: "javascript:alert(1)",
      yearsOfExperience: -1,
    }).success,
    false
  );
  assert.equal(
    profileSchema.safeParse({
      linkedinUrl: "https://www.linkedin.com/in/example",
      yearsOfExperience: 4,
    }).success,
    true
  );
});

test("reset tokens are random and stored only as hashes", () => {
  const token = generateResetToken();
  assert.ok(token.length >= 32);
  assert.notEqual(token, hashToken(token));
  assert.equal(hashToken(token), hashToken(token));
  assert.equal(hashToken(token).length, 64);
});

test("password reset and role schemas reject unsafe input", () => {
  assert.equal(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success, false);
  assert.equal(
    resetPasswordSchema.safeParse({ token: "short", password: "long enough password" }).success,
    false
  );
  assert.equal(rolesSchema.safeParse({ roles: [] }).success, false);
  assert.equal(rolesSchema.safeParse({ roles: ["MENTEE", "MENTOR"] }).success, true);
});
