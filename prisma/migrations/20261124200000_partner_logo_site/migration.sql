-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "contact" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "PartnerLogo" (
    "partnerId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerLogo_pkey" PRIMARY KEY ("partnerId")
);

-- AddForeignKey
ALTER TABLE "PartnerLogo" ADD CONSTRAINT "PartnerLogo_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

