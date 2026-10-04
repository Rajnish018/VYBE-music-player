-- CreateEnum
CREATE TYPE "UploadOperationType" AS ENUM ('CREATE', 'REPLACE_AUDIO');

-- AlterTable
ALTER TABLE "UploadOperation" ADD COLUMN     "oldMegaAudioNodeId" TEXT,
ADD COLUMN     "oldMegaCoverNodeId" TEXT,
ADD COLUMN     "type" "UploadOperationType" NOT NULL DEFAULT 'CREATE';

-- CreateIndex
CREATE INDEX "UploadOperation_type_idx" ON "UploadOperation"("type");
