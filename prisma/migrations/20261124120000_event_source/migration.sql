-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_sourceUrl_key" ON "Event"("sourceUrl");

