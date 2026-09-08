-- feature/whatsapp-mentor: add an opt-in, unique WhatsApp handle to User.
-- Additive and safe: the column is nullable, so every existing row stays valid
-- with whatsappPhone = NULL. A partial-style unique index (Postgres allows many
-- NULLs under a plain UNIQUE) enforces one number -> one user for enrolled
-- mentors only. Nothing in login/register touches this column.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "whatsappPhone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_whatsappPhone_key" ON "User"("whatsappPhone");
