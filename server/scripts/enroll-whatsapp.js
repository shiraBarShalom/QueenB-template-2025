/* eslint-disable no-console */
// ============================================================================
// Enroll ONE existing mentor's WhatsApp number (feature/whatsapp-mentor).
// ============================================================================
// Sets User.whatsappPhone (normalized E.164) for a single demo mentor so the
// Twilio webhook can recognise her. Does NOT create users, touch scheduling
// data, or change anything else.
//
// Usage:
//   node scripts/enroll-whatsapp.js --phone "+972501234567"
//   node scripts/enroll-whatsapp.js --email dana@example.com --phone "whatsapp:+972501234567"
//   node scripts/enroll-whatsapp.js --email maya@example.com --phone "0501234567"
//   node scripts/enroll-whatsapp.js --email dana@example.com --clear
//
// --email defaults to dana@example.com (the seeded "Dana Levi" mentor).
// The number you pass MUST be your Twilio Sandbox-joined WhatsApp number.
// ============================================================================

require("dotenv").config();
const prisma = require("../prismaClient");
const { normalizeE164, isE164 } = require("../utils/phone");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

async function main() {
  const email = arg("email") || "dana@example.com";
  const clear = hasFlag("clear");
  const rawPhone = arg("phone");

  if (!clear && !rawPhone) {
    console.error(
      'Missing --phone.\n' +
        '  node scripts/enroll-whatsapp.js --email dana@example.com --phone "+972501234567"'
    );
    process.exit(1);
  }

  const phone = clear ? null : normalizeE164(rawPhone);
  if (!clear && !isE164(phone)) {
    console.error(`Could not normalize "${rawPhone}" to E.164 (got: ${phone}).`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { mentorProfile: { select: { id: true } } },
  });
  if (!user) {
    console.error(`No user with email ${email}. Seed the DB first: npm run prisma:seed`);
    process.exit(1);
  }
  if (!user.mentorProfile) {
    console.error(
      `User ${email} exists but has no MentorProfile — the WhatsApp companion is mentor-only.`
    );
    process.exit(1);
  }

  if (!clear) {
    const clash = await prisma.user.findUnique({ where: { whatsappPhone: phone } });
    if (clash && clash.id !== user.id) {
      console.error(
        `Phone ${phone} is already enrolled for user #${clash.id} (${clash.email}). ` +
          `Clear it first: node scripts/enroll-whatsapp.js --email ${clash.email} --clear`
      );
      process.exit(1);
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { whatsappPhone: phone },
    select: {
      id: true,
      email: true,
      fullName: true,
      whatsappPhone: true,
      mentorProfile: { select: { id: true } },
    },
  });

  if (clear) {
    console.log(`Cleared whatsappPhone for ${updated.fullName} <${updated.email}>.`);
    return;
  }

  console.log("WhatsApp number enrolled:");
  console.log(`  user:            #${updated.id} ${updated.fullName} <${updated.email}>`);
  console.log(`  mentorProfileId: ${updated.mentorProfile.id}`);
  console.log(`  whatsappPhone:   ${updated.whatsappPhone}`);
  console.log('\nNow send "היי" from this number in the Twilio WhatsApp Sandbox.');
}

main()
  .catch((e) => {
    console.error("enroll failed:", e.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
