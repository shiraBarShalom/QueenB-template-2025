// ============================================================================
// Local development seed for Queens Match (Prisma).
// ============================================================================
// Safe to re-run: users are upserted by email; mentor profiles and the sample
// request are created only when missing. Does not wipe existing data.
//
// Default password for every seeded user: password123
// Hash format matches userService (scrypt$salt$derivedKey).
// ============================================================================

require("dotenv").config();

const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DEV_PASSWORD = "password123";

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(plain), salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function technologiesConnect(names) {
  return {
    connectOrCreate: names.map((name) => ({
      where: { name },
      create: { name },
    })),
  };
}

function topicsConnect(names) {
  return {
    connectOrCreate: names.map((name) => ({
      where: { name },
      create: { name },
    })),
  };
}

async function upsertUser({ email, fullName, extras = {}, technologies = [] }) {
  const passwordHash = hashPassword(DEV_PASSWORD);

  return prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      fullName,
      ...extras,
      technologies: technologiesConnect(technologies),
    },
    update: {
      fullName,
      ...extras,
      // Keep an existing password hash on re-seed so local logins stay stable.
      technologies: technologiesConnect(technologies),
    },
    include: { mentorProfile: true },
  });
}

async function ensureMentorProfile(user, { background, meetingCapacity, meetingDurationMinutes, topics }) {
  if (user.mentorProfile) {
    return prisma.mentorProfile.update({
      where: { id: user.mentorProfile.id },
      data: {
        background,
        meetingCapacity,
        meetingDurationMinutes,
        mentoringTopics: topicsConnect(topics),
      },
    });
  }

  return prisma.mentorProfile.create({
    data: {
      userId: user.id,
      background,
      meetingCapacity,
      meetingDurationMinutes,
      mentoringTopics: topicsConnect(topics),
    },
  });
}

async function ensureSampleRequest(menteeId, mentorProfileId) {
  const existing = await prisma.mentoringRequest.findFirst({
    where: { menteeId, mentorProfileId },
  });

  if (existing) return existing;

  return prisma.mentoringRequest.create({
    data: {
      menteeId,
      mentorProfileId,
      status: "WAITING_FOR_MENTOR_SLOTS",
    },
  });
}

async function main() {
  console.log("Seeding development data…");
  console.log(`  Default password for all seeded users: ${DEV_PASSWORD}`);

  const admin = await upsertUser({
    email: "admin@queensmatch.dev",
    fullName: "Queens Match Admin",
    extras: { isAdmin: true, jobTitle: "Platform Admin" },
  });

  const dana = await upsertUser({
    email: "dana@example.com",
    fullName: "Dana Levi",
    extras: {
      jobTitle: "Senior Software Engineer",
      workplace: "TechCo",
      yearsOfExperience: 8,
      linkedinUrl: "https://linkedin.com/in/dana-levi",
      githubUrl: "https://github.com/dana-levi",
    },
    technologies: ["React", "Node.js", "TypeScript"],
  });

  const maya = await upsertUser({
    email: "maya@example.com",
    fullName: "Maya Cohen",
    extras: {
      jobTitle: "Backend Engineer",
      workplace: "DataWorks",
      yearsOfExperience: 5,
      linkedinUrl: "https://linkedin.com/in/maya-cohen",
    },
    technologies: ["Python", "Django", "PostgreSQL"],
  });

  const shira = await upsertUser({
    email: "shira@example.com",
    fullName: "Shira Azulay",
    extras: {
      jobTitle: "Junior Developer",
      workplace: "StartupXYZ",
      yearsOfExperience: 1,
    },
    technologies: ["JavaScript"],
  });

  const danaMentor = await ensureMentorProfile(dana, {
    background: "8 years in backend and fullstack roles at startups. Happy to help with interviews and career planning.",
    meetingCapacity: 4,
    meetingDurationMinutes: 30,
    topics: ["Mock interviews", "Career planning", "TechCo interview prep"],
  });

  const mayaMentor = await ensureMentorProfile(maya, {
    background: "5 years specializing in Python backend systems and data platforms.",
    meetingCapacity: 3,
    meetingDurationMinutes: 45,
    topics: ["Career transitions", "System design basics"],
  });

  const sampleRequest = await ensureSampleRequest(shira.id, danaMentor.id);

  console.log("Seed complete:");
  console.log(`  Users:              ${admin.email}, ${dana.email}, ${maya.email}, ${shira.email}`);
  console.log(`  MentorProfiles:     dana=#${danaMentor.id}, maya=#${mayaMentor.id}`);
  console.log(`  MentoringRequest:   #${sampleRequest.id} (${sampleRequest.status})`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
