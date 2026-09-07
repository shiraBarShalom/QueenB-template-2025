const { Resend } = require("resend");
const env = require("../config/env");

async function sendPasswordResetEmail({ email, displayName, token }) {
  const config = env.getEmailConfig();
  const resetUrl = new URL("/reset-password", env.clientOrigin);
  resetUrl.searchParams.set("token", token);

  const greeting = displayName ? `Hi ${displayName},` : "Hi,";
  const text = `${greeting}\n\nReset your MentorMe password: ${resetUrl}\n\nThis link expires in ${config.resetTtlMinutes} minutes. If you did not request it, ignore this email.`;
  const html = `<p>${greeting}</p><p><a href="${resetUrl.toString()}">Reset your MentorMe password</a></p><p>This link expires in ${config.resetTtlMinutes} minutes. If you did not request it, ignore this email.</p>`;

  if (!config.apiKey) {
    if (env.nodeEnv === "production") {
      throw new Error("RESEND_API_KEY is required to send password reset emails");
    }
    console.info("Password reset link (development only):", resetUrl.toString());
    return;
  }

  const resend = new Resend(config.apiKey);
  const { error } = await resend.emails.send({
    from: config.from,
    to: email,
    subject: "Reset your MentorMe password",
    text,
    html,
  });

  if (error) {
    throw new Error(`Resend rejected the password reset email: ${error.message}`);
  }
}

module.exports = { sendPasswordResetEmail };
