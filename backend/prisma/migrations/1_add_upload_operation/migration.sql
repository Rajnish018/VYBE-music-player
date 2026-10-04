-- Add MEGA audio and cover node IDs to UploadOperation
ALTER TABLE "UploadOperation"
ADD COLUMN "megaAudioNodeId" TEXT,
ADD COLUMN "megaCoverNodeId" TEXT;
