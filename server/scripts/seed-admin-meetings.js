require("../config/env");
const prisma = require("../prismaClient");

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function main() {
  const existing = await prisma.mentoringRequest.count();
  if (existing > 0) {
    console.log(`Skipping seed: ${existing} mentoring request(s) already exist.`);
    return;
  }

  const users = await prisma.user.findMany({ orderBy: { id: "asc" } });
  if (users.length < 2) {
    throw new Error("Need at least two users to seed admin meeting examples.");
  }

  const mentee = users[0];
  const mentorUser = users.find((user) => user.id !== mentee.id);

  await prisma.userRole.upsert({
    where: { userId_role: { userId: mentorUser.id, role: "MENTOR" } },
    update: {},
    create: { userId: mentorUser.id, role: "MENTOR" },
  });

  const mentorProfile = await prisma.mentorProfile.upsert({
    where: { userId: mentorUser.id },
    update: {},
    create: {
      userId: mentorUser.id,
      background: "Demo mentor profile for the administrator report.",
      meetingCapacity: 8,
      meetingDurationMinutes: 45,
    },
  });

  const samples = [
    { status: "WAITING_FOR_MENTOR_SLOTS" },
    { status: "WAITING_FOR_MENTEE_SELECTION" },
    { status: "MATCHED", start: hoursFromNow(48), end: hoursFromNow(49) },
    { status: "MATCHED", start: hoursFromNow(-26), end: hoursFromNow(-25) },
    { status: "ATTENDANCE_CONFIRMED", start: hoursFromNow(6), end: hoursFromNow(7) },
    {
      status: "COMPLETED",
      start: hoursFromNow(-8 * 24),
      end: hoursFromNow(-8 * 24 + 1),
      meetingStatus: "COMPLETED",
    },
    {
      status: "NOT_COMPLETED",
      start: hoursFromNow(-12),
      end: hoursFromNow(-11),
      meetingStatus: "NOT_COMPLETED",
    },
    {
      status: "FEEDBACK_COMPLETED",
      start: hoursFromNow(-72),
      end: hoursFromNow(-71),
      meetingStatus: "COMPLETED",
      feedback: true,
    },
  ];

  for (const sample of samples) {
    const request = await prisma.mentoringRequest.create({
      data: {
        menteeId: mentee.id,
        mentorProfileId: mentorProfile.id,
        status: sample.status,
      },
    });

    if (!sample.start) continue;

    const meeting = await prisma.meeting.create({
      data: {
        requestId: request.id,
        attemptNumber: 1,
        scheduledStart: sample.start,
        scheduledEnd: sample.end,
        status: sample.meetingStatus || "SCHEDULED",
      },
    });

    if (sample.feedback) {
      await prisma.feedback.createMany({
        data: [
          {
            meetingId: meeting.id,
            authorId: mentee.id,
            answers: { summary: "The session was clear and helpful." },
          },
          {
            meetingId: meeting.id,
            authorId: mentorUser.id,
            answers: { summary: "The mentee came prepared." },
          },
        ],
      });
    }
  }

  console.log("Seeded administrator meeting examples.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
