import { Prisma } from '@prisma/client';

/**
 * Split a comma-separated artist string into individual artist names.
 *
 * Example:
 *
 * "Arijit Singh, Shreya Ghoshal"
 *
 * becomes:
 *
 * [
 *   "Arijit Singh",
 *   "Shreya Ghoshal"
 * ]
 */
export function splitArtistNames(
  value: string | null | undefined,
): string[] {
  if (!value) {
    return [];
  }

  return [
    ...new Set(
      String(value)
        .split(',')
        .map((artist) => artist.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Normalize an individual artist name for database lookup.
 *
 * Examples:
 *
 * "Arijit Singh"
 * " arijit   singh "
 *
 * both become:
 *
 * "arijit singh"
 */
export function normalizeArtistEntityName(
  value: string,
): string {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

/**
 * Create/update Artist records and synchronize
 * TrackArtist relationships for a track.
 *
 * Example:
 *
 * Track.artist =
 * "Arijit Singh, Shreya Ghoshal"
 *
 * creates:
 *
 * Artist
 * ├── Arijit Singh
 * └── Shreya Ghoshal
 *
 * TrackArtist
 * ├── Track -> Arijit Singh
 * └── Track -> Shreya Ghoshal
 */
export async function syncTrackArtists(
  tx: Prisma.TransactionClient,
  trackId: string,
  artistValue: string,
): Promise<void> {
  const artistNames =
    splitArtistNames(artistValue);

  /*
   * Remove the current artist relationships first.
   *
   * This is important when an admin edits a song.
   *
   * Example:
   *
   * BEFORE:
   * Arijit Singh, Shreya Ghoshal
   *
   * AFTER:
   * Arijit Singh, Vishal Dadlani
   *
   * The old Shreya relationship must be removed.
   */
  await tx.trackArtist.deleteMany({
    where: {
      trackId,
    },
  });

  /*
   * Create/reuse each individual Artist.
   */
  for (const artistName of artistNames) {
    const normalizedName =
      normalizeArtistEntityName(
        artistName,
      );

    if (!normalizedName) {
      continue;
    }

    /*
     * Reuse an existing Artist if it already exists.
     *
     * Otherwise create a new one.
     */
    const artist =
      await tx.artist.upsert({
        where: {
          normalizedName,
        },

        update: {
          /*
           * Keep the existing artist's current
           * name when possible.
           *
           * We intentionally don't modify coverUrl,
           * coverMimeType or coverUpdatedAt here.
           */
        },

        create: {
          name: artistName,
          normalizedName,
        },
      });

    /*
     * Connect the Artist to this Track.
     */
    await tx.trackArtist.create({
      data: {
        trackId,
        artistId: artist.id,
      },
    });
  }
}