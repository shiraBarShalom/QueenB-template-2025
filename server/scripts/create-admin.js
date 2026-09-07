const readline = require("readline-sync");
const db = require("../db");
const { registerSchema } = require("../validation/users");
const { createAdmin } = require("../services/usersService");

async function main() {
  console.log("Create or promote a MentorMe administrator");
  const displayName = readline.question("Display name: ").trim();
  const email = readline.questionEMail("Email: ").trim().toLowerCase();
  const password = readline.question("Password (12-128 characters): ", {
    hideEchoBack: true,
    mask: "",
  });
  const confirmation = readline.question("Confirm password: ", {
    hideEchoBack: true,
    mask: "",
  });

  if (password !== confirmation) {
    throw new Error("Passwords do not match");
  }

  const parsed = registerSchema.safeParse({ displayName, email, password });
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(details);
  }

  const admin = await createAdmin(parsed.data);
  console.log(`Administrator ready: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(`Could not create administrator: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
