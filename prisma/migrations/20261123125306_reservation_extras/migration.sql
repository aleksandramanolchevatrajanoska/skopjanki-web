-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "captainAlertSentAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "replacedAt" TIMESTAMP(3),
ADD COLUMN     "stripePaymentIntentId" TEXT;
