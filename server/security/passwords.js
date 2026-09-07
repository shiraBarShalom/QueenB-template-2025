const argon2 = require("argon2");

const options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const dummyHash = argon2.hash("dummy-password-that-is-never-valid", options);

function hashPassword(password) {
  return argon2.hash(password, options);
}

function verifyPassword(hash, password) {
  return argon2.verify(hash, password);
}

async function performDummyVerification(password) {
  return argon2.verify(await dummyHash, password).catch(() => false);
}

module.exports = { hashPassword, verifyPassword, performDummyVerification };
