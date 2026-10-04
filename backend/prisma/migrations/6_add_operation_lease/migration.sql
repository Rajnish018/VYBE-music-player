ALTER TABLE "UploadOperation"
ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);

CREATE INDEX "UploadOperation_leaseExpiresAt_idx"
ON "UploadOperation" ("leaseExpiresAt");

