-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "profile" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "profileUpdatedAt" TIMESTAMP(3);
