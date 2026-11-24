-- AlterTable
ALTER TABLE "User" ADD COLUMN     "about" TEXT,
ADD COLUMN     "topics" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "WeeklyLetter" (
    "weekKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyLetter_pkey" PRIMARY KEY ("weekKey")
);
