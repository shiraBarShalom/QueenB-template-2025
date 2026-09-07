-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByUserId" INTEGER;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
