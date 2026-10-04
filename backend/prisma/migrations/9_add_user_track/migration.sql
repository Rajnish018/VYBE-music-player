-- CreateTable
CREATE TABLE "UserTrack" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserTrack_userId_idx" ON "UserTrack"("userId");

-- CreateIndex
CREATE INDEX "UserTrack_trackId_idx" ON "UserTrack"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTrack_userId_trackId_key"
ON "UserTrack"("userId", "trackId");

-- AddForeignKey
ALTER TABLE "UserTrack"
ADD CONSTRAINT "UserTrack_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTrack"
ADD CONSTRAINT "UserTrack_trackId_fkey"
FOREIGN KEY ("trackId")
REFERENCES "Track"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
