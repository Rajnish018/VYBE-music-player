CREATE UNIQUE INDEX "UploadOperation_active_track_unique"
ON "UploadOperation" ("trackId")
WHERE "trackId" IS NOT NULL
  AND "status" IN (
    'PENDING',
    'UPLOADING',
    'DB_COMMITTING',
    'ROLLING_BACK'
  );