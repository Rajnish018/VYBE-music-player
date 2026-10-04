-- ============================================================
-- 1. Create Artist table
-- ============================================================

CREATE TABLE "Artist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,

    -- Artist-specific image
    -- NOT the song cover
    "coverUrl" TEXT,
    "coverMimeType" TEXT,
    "coverUpdatedAt" TIMESTAMP(3),

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artist_pkey"
        PRIMARY KEY ("id")
);


-- ============================================================
-- 2. Artist indexes
-- ============================================================

CREATE UNIQUE INDEX "Artist_normalizedName_key"
ON "Artist"("normalizedName");

CREATE INDEX "Artist_name_idx"
ON "Artist"("name");


-- ============================================================
-- 3. Create TrackArtist relationship table
-- ============================================================

CREATE TABLE "TrackArtist" (
    "trackId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,

    CONSTRAINT "TrackArtist_pkey"
        PRIMARY KEY ("trackId", "artistId")
);


-- ============================================================
-- 4. TrackArtist indexes
-- ============================================================

CREATE INDEX "TrackArtist_artistId_idx"
ON "TrackArtist"("artistId");


-- ============================================================
-- 5. Foreign keys
-- ============================================================

ALTER TABLE "TrackArtist"
ADD CONSTRAINT "TrackArtist_trackId_fkey"
FOREIGN KEY ("trackId")
REFERENCES "Track"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "TrackArtist"
ADD CONSTRAINT "TrackArtist_artistId_fkey"
FOREIGN KEY ("artistId")
REFERENCES "Artist"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


-- ============================================================
-- 6. BACKFILL EXISTING ARTISTS
--
-- Example:
--
-- Track.artist
-- "Arijit Singh, Shreya Ghoshal"
--
-- becomes:
--
-- Artist
-- "Arijit Singh"
-- "Shreya Ghoshal"
--
-- Existing Track.artist is NOT changed.
-- ============================================================

INSERT INTO "Artist"
(
    "id",
    "name",
    "normalizedName",
    "createdAt",
    "updatedAt"
)
SELECT
    md5(
        random()::text ||
        clock_timestamp()::text ||
        artist_name
    ),

    artist_name,

    LOWER(
        REGEXP_REPLACE(
            TRIM(artist_name),
            '\s+',
            ' ',
            'g'
        )
    ),

    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP

FROM (
    SELECT DISTINCT
        TRIM(value) AS artist_name

    FROM "Track",

    LATERAL unnest(
        string_to_array("artist", ',')
    ) AS value

    WHERE TRIM(value) <> ''
) AS artists

ON CONFLICT ("normalizedName")
DO NOTHING;


-- ============================================================
-- 7. CREATE TRACK ↔ ARTIST RELATIONSHIPS
--
-- Example:
--
-- Track.artist:
-- "Arijit Singh, Shreya Ghoshal"
--
-- creates:
--
-- TrackArtist
-- Track -> Arijit Singh
-- Track -> Shreya Ghoshal
--
-- Existing Track rows are NOT modified.
-- ============================================================

INSERT INTO "TrackArtist"
(
    "trackId",
    "artistId"
)

SELECT DISTINCT
    t."id",
    a."id"

FROM "Track" t

CROSS JOIN LATERAL unnest(
    string_to_array(t."artist", ',')
) AS artist_value

JOIN "Artist" a
    ON a."normalizedName" =
       LOWER(
           REGEXP_REPLACE(
               TRIM(artist_value),
               '\s+',
               ' ',
               'g'
           )
       )

WHERE TRIM(artist_value) <> ''

ON CONFLICT ("trackId", "artistId")
DO NOTHING;