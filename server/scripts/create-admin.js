// ============================================================================
// Bootstrap / promote an administrator.  Prisma reimplementation of
// origin/main's raw-SQL scripts/create-admin.js.
//
//   node scripts/create-admin.js <email> [displayName] [password]
//
// - If a user with <email> exists  -> set isAdmin = true (and isActive = true).
// - If not, and displayName + password (>= 12 chars) are given -> create the
//   account as an admin.
// Admins are ONLY created here, never through the public API.
// ============================================================================

require("dotenv").config();
const prisma = require("../prismaClient");
const { hashPassword } = require("../services/userService");

async function main() {
  const [, , emailArg, displayName, password] = process.argv;
  if (!emailArg) {
    console.error("Usage: node scripts/create-admin.js <email> [displayName] [password]");
    process.exit(1);
  }
  const email = emailArg.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const updated = await prisma.user.update({
      where: { email },
      data: { isAdmin: true, isActive: true },
      select: { id: true, email: true, fullName: true, isAdmin: true },
    });
    console.log("Promoted existing user to admin:", updated);
    return;
  }

  if (!displayName || !password) {
    console.error(
      `No user with ${email}. To create one, pass: <email> <displayName> <password (>=12 chars)>`
    );
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const created = await prisma.user.create({
    data: {
      email,
      fullName: displayName.trim(),
      passwordHash: hashPassword(password),
      isAdmin: true,
    },
    select: { id: true, email: true, fullName: true, isAdmin: true },
  });
  console.log("Created admin account:", created);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
