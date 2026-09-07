/**
 * Smoke-check: createRequest rejects a second open request for the same
 * mentee + mentorProfile pair with 409 "Request already sent".
 * Uses ephemeral users (does not depend on demo seed).
 */
const requestService = require("../services/requestService");
const { ApiError } = require("../utils/prismaError");
const prisma = require("../prismaClient");

async function main() {
  const stamp = Date.now();
  const mentorUser = await prisma.user.create({
    data: {
      email: `dup.mentor.${stamp}@verify.local`,
      passwordHash: "x",
      fullName: "Dup Mentor",
    },
  });
  const menteeUser = await prisma.user.create({
    data: {
      email: `dup.mentee.${stamp}@verify.local`,
      passwordHash: "x",
      fullName: "Dup Mentee",
    },
  });
  const mentorProfile = await prisma.mentorProfile.create({
    data: {
      userId: mentorUser.id,
      background: "bg",
      meetingCapacity: 5,
      meetingDurationMinutes: 30,
    },
  });

  const first = await requestService.createRequest({
    menteeId: menteeUser.id,
    mentorProfileId: mentorProfile.id,
  });

  let threw = null;
  try {
    await requestService.createRequest({
      menteeId: menteeUser.id,
      mentorProfileId: mentorProfile.id,
    });
  } catch (err) {
    threw = err;
  }

  const ok =
    threw instanceof ApiError &&
    threw.status === 409 &&
    threw.message === "Request already sent" &&
    threw.data &&
    threw.data.id === first.id;

  console.log(
    ok
      ? `PASS: duplicate createRequest -> 409 (open id=${first.id})`
      : `FAIL: expected ApiError 409 with existing request`,
    !ok && threw
      ? { name: threw.name, status: threw.status, message: threw.message }
      : ""
  );

  await prisma.notification.deleteMany({
    where: { OR: [{ recipientId: mentorUser.id }, { recipientId: menteeUser.id }] },
  });
  await prisma.mentoringRequest.deleteMany({
    where: { menteeId: menteeUser.id },
  });
  await prisma.mentorProfile.delete({ where: { id: mentorProfile.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [mentorUser.id, menteeUser.id] } },
  });

  process.exit(ok ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
