-- AlterTable
ALTER TABLE "EventNote" ADD COLUMN     "parentId" TEXT;

-- AddForeignKey
ALTER TABLE "EventNote" ADD CONSTRAINT "EventNote_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "EventNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

