-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "videoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

