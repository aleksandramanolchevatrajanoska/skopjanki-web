-- AlterTable
ALTER TABLE "User" ADD COLUMN     "memberCardSentAt" TIMESTAMP(3),
ADD COLUMN     "memberCardToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_memberCardToken_key" ON "User"("memberCardToken");

