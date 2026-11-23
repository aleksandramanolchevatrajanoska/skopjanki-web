-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "agenda" JSONB,
ADD COLUMN     "tagline" TEXT,
ADD COLUMN     "vibe" TEXT;

-- CreateTable
CREATE TABLE "EventPoster" (
    "eventId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPoster_pkey" PRIMARY KEY ("eventId")
);

-- AddForeignKey
ALTER TABLE "EventPoster" ADD CONSTRAINT "EventPoster_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
