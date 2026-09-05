import { prisma } from '../config/db';
import { Track } from '@prisma/client';

/*
 * Normalize a track title for database-level duplicate detection.
 *
 * Important:
 * - This function must be deterministic because its output is stored in
 *   Track.normalizedTitle.
 * - It removes common download/YouTube noise such as bitrate, quality,
 *   "official video", and filename separators.
 */
export function normalizeTitle(title: string): string {
  if (!title) return '';

  let clean = String(title).toLowerCase();

  // Normalize filename separators first.
  clean = clean.replace(/[_]+/g, ' ');

  // Remove bracketed technical/video noise.
  clean = clean.replace(
    /\s*[\(\[][^)\]]*\b(?:official|video|audio|lyric|lyrics|hd|hq|1080p|4k)\b[^)\]]*[\)\]]/gi,
    ' ',
  );

  // Remove bitrate / sample-rate information anywhere in the title.
  clean = clean.replace(
    /\s*[\(\[]?\s*\d+(?:\.\d+)?\s*(?:kbps|kb\/s|kbs|khz|hz)\s*[\)\]]?/gi,
    ' ',
  );

  // Remove common video/audio suffixes.
  clean = clean.replace(
    /\b(?:official\s+music\s+video|official\s+video|official\s+audio|lyric\s+video|lyrics|video|audio|hd|hq|1080p|4k)\b/gi,
    ' ',
  );

  // Remove trailing numeric download IDs such as "- 26224".
  clean = clean.replace(/\s*[-–—]\s*\d+\s*$/g, ' ');

  // Remove a trailing standalone numeric ID if present.
  clean = clean.replace(/\s+\d+\s*$/g, ' ');

  // Treat underscores/hyphens and punctuation as separators.
  clean = clean.replace(/[_]+/g, ' ');
  clean = clean.replace(/[.,\/#!$%^&*;:{}=`~()[\]"']/g, ' ');

  // Collapse whitespace.
  clean = clean.replace(/\s+/g, ' ').trim();

  return clean;
}

/*
 * Normalize artist names for exact duplicate detection.
 */
export function normalizeArtist(artist: string): string {
  if (!artist) return '';

  let clean = String(artist).toLowerCase();

  clean = clean.replace(/[_]+/g, ' ');

  // Remove common YouTube/channel suffixes.
  clean = clean.replace(/\bvevo\b/gi, ' ');
  clean = clean.replace(/\btopic\b/gi, ' ');
  clean = clean.replace(/\bofficial\b/gi, ' ');
  clean = clean.replace(/\bmusic\b/gi, ' ');

  // Remove punctuation while preserving word boundaries.
  clean = clean.replace(/[.,\/#!$%^&*;:{}=`~()[\]"'_-]/g, ' ');

  clean = clean.replace(/\s+/g, ' ').trim();

  return clean;
}

export function getLevenshteinDistance(
  a: string,
  b: string,
): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] =
          matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export function getStringSimilarity(
  a: string,
  b: string,
): number {
  const distance =
    getLevenshteinDistance(a, b);

  const maxLength =
    Math.max(a.length, b.length);

  if (maxLength === 0) return 1.0;

  return 1.0 - distance / maxLength;
}

export interface DeduplicationResult {
  matchType:
    | 'EXACT_SOURCE'
    | 'EXACT_METADATA'
    | 'FUZZY_MATCH'
    | 'NONE';

  confidence: number;
  track: Track | null;
}

export class DeduplicationService {
  /*
   * Search for duplicate tracks used by the YouTube/source ingestion flow.
   *
   * This method intentionally keeps the existing three-level behavior:
   * 1. exact source
   * 2. exact normalized metadata
   * 3. fuzzy metadata + duration
   */
  async findDuplicate(
    videoId: string,
    title: string,
    channelTitle: string,
    duration: number,
  ): Promise<DeduplicationResult> {
    // 1. Exact source match.
    const sourceMatch =
      await prisma.trackSource.findUnique({
        where: {
          provider_sourceId: {
            provider: 'youtube',
            sourceId: videoId,
          },
        },
        include: {
          track: true,
        },
      });

    if (
      sourceMatch &&
      sourceMatch.track
    ) {
      return {
        matchType: 'EXACT_SOURCE',
        confidence: 1.0,
        track: sourceMatch.track,
      };
    }

    const normTitle =
      normalizeTitle(title);

    const normArtist =
      normalizeArtist(channelTitle);

    // 2. Exact normalized metadata match.
    const metadataMatch =
      await prisma.track.findFirst({
        where: {
          normalizedTitle: normTitle,
          normalizedArtist: normArtist,
        },
      });

    if (metadataMatch) {
      /*
       * A source can be associated with an existing Track.
       * Ignore a duplicate source-link race instead of converting it
       * into an unexpected 500.
       */
      try {
        await prisma.trackSource.create({
          data: {
            trackId: metadataMatch.id,
            provider: 'youtube',
            sourceId: videoId,
            sourceUrl:
              `https://www.youtube.com/watch?v=${videoId}`,
          },
        });
      } catch (error: any) {
        if (error?.code !== 'P2002') {
          throw error;
        }
      }

      return {
        matchType: 'EXACT_METADATA',
        confidence: 1.0,
        track: metadataMatch,
      };
    }

    // 3. Fuzzy metadata match.
    const candidates =
      await prisma.track.findMany({
        take: 100,
      });

    let bestCandidate: Track | null =
      null;

    let maxConfidence = 0;

    for (const candidate of candidates) {
      const durationDiff =
        Math.abs(
          candidate.duration -
            duration,
        );

      if (durationDiff > 15) {
        continue;
      }

      const titleSimilarity =
        getStringSimilarity(
          candidate.normalizedTitle,
          normTitle,
        );

      const artistSimilarity =
        getStringSimilarity(
          candidate.normalizedArtist,
          normArtist,
        );

      const confidence =
        titleSimilarity * 0.7 +
        artistSimilarity * 0.3;

      if (
        confidence > maxConfidence
      ) {
        maxConfidence = confidence;
        bestCandidate = candidate;
      }
    }

    // High-confidence fuzzy match.
    if (
      maxConfidence >= 0.85 &&
      bestCandidate
    ) {
      try {
        await prisma.trackSource.create({
          data: {
            trackId: bestCandidate.id,
            provider: 'youtube',
            sourceId: videoId,
            sourceUrl:
              `https://www.youtube.com/watch?v=${videoId}`,
          },
        });
      } catch (error: any) {
        if (error?.code !== 'P2002') {
          throw error;
        }
      }

      return {
        matchType: 'FUZZY_MATCH',
        confidence: maxConfidence,
        track: bestCandidate,
      };
    }

    // Moderate/low confidence candidate.
    if (
      maxConfidence >= 0.60 &&
      bestCandidate
    ) {
      return {
        matchType: 'FUZZY_MATCH',
        confidence: maxConfidence,
        track: bestCandidate,
      };
    }

    return {
      matchType: 'NONE',
      confidence: 0,
      track: null,
    };
  }

  /*
   * Explicitly associate a YouTube source with a Track.
   */
  async linkSourceToTrack(
    trackId: string,
    videoId: string,
  ): Promise<void> {
    const existing =
      await prisma.trackSource.findUnique({
        where: {
          provider_sourceId: {
            provider: 'youtube',
            sourceId: videoId,
          },
        },
      });

    if (existing) {
      if (
        existing.trackId !== trackId
      ) {
        await prisma.trackSource.update({
          where: {
            id: existing.id,
          },
          data: {
            trackId,
          },
        });
      }

      return;
    }

    await prisma.trackSource.create({
      data: {
        trackId,
        provider: 'youtube',
        sourceId: videoId,
        sourceUrl:
          `https://www.youtube.com/watch?v=${videoId}`,
      },
    });
  }
}

export const deduplicationService =
  new DeduplicationService();
