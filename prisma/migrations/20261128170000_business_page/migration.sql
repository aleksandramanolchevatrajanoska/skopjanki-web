-- AlterTable
ALTER TABLE "MemberBusiness" ADD COLUMN     "links" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "BusinessFile" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessFile_businessId_idx" ON "BusinessFile"("businessId");

-- AddForeignKey
ALTER TABLE "BusinessFile" ADD CONSTRAINT "BusinessFile_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "MemberBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

