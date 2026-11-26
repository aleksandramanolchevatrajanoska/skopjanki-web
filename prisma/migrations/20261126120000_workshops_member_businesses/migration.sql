-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "commissionPaidAt" TIMESTAMP(3),
ADD COLUMN     "commissionPct" INTEGER,
ADD COLUMN     "workshop" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MemberBusiness" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "offer" TEXT,
    "instagram" TEXT,
    "website" TEXT,
    "contact" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberBusiness_status_idx" ON "MemberBusiness"("status");

-- AddForeignKey
ALTER TABLE "MemberBusiness" ADD CONSTRAINT "MemberBusiness_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

