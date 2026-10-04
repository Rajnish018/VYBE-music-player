import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {
  Prisma,
  UploadOperationType,
  UploadStatus,
} from '@prisma/client';

import { prisma } from '../config/db';
import {
  authenticate,
  requireAdmin,
} from '../middleware/auth';
import { upload, adminTrackUpload } from '../middleware/upload';

import { megaService } from '../services/megaService';
import {
  createUploadOperation,
  updateUploadOperation,
} from '../services/uploadOperationService';
import {
  cleanupDeletedAudioOperation,
  cleanupDeletedCoverOperation,
  cleanupDeletedTrackOperation,
  rollbackMegaResources,
  rollbackUploadOperation,
} from '../services/rollbackService';

import {
  normalizeTitle,
  normalizeArtist,
} from '../services/deduplicationService';

import {
  extractAudioMetadata,
} from '../services/audioMetadataService';
import {
  invalidateAllFavoritesCaches,
  invalidateTrackCache,
} from '../services/redisService';

import {
  syncTrackArtists,
} from '../services/artistService';

const router = Router();

function isTrackOperationInProgressError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === 'TRACK_OPERATION_IN_PROGRESS'
  );
}

function sendTrackOperationConflict(res: Response) {
  return res.status(409).json({
    error: 'TRACK_OPERATION_IN_PROGRESS',
    message: 'Another operation is already in progress for this track.',
  });
}

/*
|--------------------------------------------------------------------------
| Allowed audio formats
|--------------------------------------------------------------------------
*/



const allowedAudioExtensions = new Set([
  '.aac',
  '.flac',
  '.m4a',
  '.mp3',
  '.oga',
  '.ogg',
  '.wav',
  '.webm',
]);

const allowedAudioMimeTypes = new Set([
  'audio/aac',
  'audio/flac',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-mpeg-3',
  'audio/x-mp3',
  'audio/x-wav',
]);

/*
|--------------------------------------------------------------------------
| Filename helpers
|--------------------------------------------------------------------------
*/

function cleanFilePart(value: string) {
  return value
    .replace(/\.[^/.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTrackTitle(value: string) {
  return value
    /*
     * Remove:
     *
     * (320 Kbps)
     * (128 Kbps)
     * (44.1 Khz)
     * (320 kb/s)
     */
    .replace(
      /\s*\([^)]*\b(?:kbps|kb\/s|kbs|khz|hz)\b[^)]*\)/gi,
      '',
    )

    /*
     * Remove trailing:
     *
     * - 26224
     * - 12345
     */
    .replace(/\s*[-–—]\s*\d+\s*$/g, '')

    /*
     * Remove trailing number if still present.
     */
    .replace(/\s+\d+\s*$/g, '')

    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(' ');
}

function inferTrackMetadata(fileName: string) {
  const baseName =
    cleanFilePart(fileName);

  const [
    artistPart,
    ...titleParts
  ] =
    baseName.split(
      /\s+-\s+|\s+--\s+/,
    );

  const hasArtistTitle =
    Boolean(
      artistPart &&
      titleParts.length > 0,
    );

  const title =
    cleanTrackTitle(
      hasArtistTitle
        ? titleParts.join(' - ')
        : baseName,
    );

  const artist =
    hasArtistTitle
      ? artistPart
      : 'Unknown Artist';

  return {
    title:
      titleCase(
        title ||
        'Untitled Track',
      ),

    artist:
      titleCase(
        artist ||
        'Unknown Artist',
      ),

    album:
      'Single',
  };
}

function normalizedAudioFileName(originalFileName: string) {
  const extension =
    path.extname(originalFileName).toLowerCase() ||
    '.mp3';

  return `audio${extension}`;
}

function isCoverFile(child: any) {
  if (child.directory) {
    return false;
  }

  const name =
    String(child.name || '').toLowerCase();

  return (
    name === 'cover.jpg' ||
    name === 'cover.jpeg' ||
    name === 'cover.png' ||
    name === 'cover.webp' ||
    name === 'cover.gif'
  );
}

function computeFileHash(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash =
      crypto.createHash('sha256');

    const stream =
      fs.createReadStream(filePath);

    stream.on('error', reject);

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
  });
}

function optionalString(value: unknown) {
  const stringValue =
    String(value || '').trim();

  return stringValue || null;
}

function optionalNumber(value: unknown) {
  const numericValue =
    Number(value);

  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.round(numericValue)
    : null;
}

function optionalBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  const stringValue =
    String(value || '').trim().toLowerCase();

  return (
    stringValue === 'true' ||
    stringValue === '1' ||
    stringValue === 'yes' ||
    stringValue === 'explicit'
  );
}

function parseDate(value: unknown) {
  const stringValue =
    optionalString(value);

  if (!stringValue) {
    return null;
  }

  const parsedDate =
    new Date(stringValue);

  return Number.isNaN(parsedDate.getTime())
    ? null
    : parsedDate;
}

function parseList(value: unknown, lowercase = false) {
  const rawValues =
    Array.isArray(value)
      ? value
      : String(value || '').split(/[;,]/);

  const seen =
    new Set<string>();

  const result: string[] =
    [];

  rawValues.forEach((item) => {
    const cleanValue =
      String(item || '').trim();

    if (!cleanValue) {
      return;
    }

    const displayValue =
      lowercase
        ? cleanValue.toLowerCase()
        : titleCase(cleanValue);

    const key =
      displayValue.toLowerCase();

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(displayValue);
  });

  return result;
}

/** Safely read optional metadata from the audio metadata service. */
function getMetadataValue(metadata: any, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
}

function getMetadataList(metadata: any, ...keys: string[]): string[] {
  for (const key of keys) {
    if (metadata?.[key] !== undefined && metadata?.[key] !== null) {
      return parseList(metadata[key]);
    }
  }
  return [];
}

function getMetadataNumber(metadata: any, ...keys: string[]) {
  return optionalNumber(getMetadataValue(metadata, ...keys));
}

function getMetadataBoolean(metadata: any, ...keys: string[]) {
  return optionalBoolean(getMetadataValue(metadata, ...keys));
}

function getDuplicateResponse(track: any) {
  return {
    error: 'DUPLICATE_TRACK',
    message:
      'This song is already in your library.',
    track: {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      thumbnailUrl:
        track.thumbnailUrl,
    },
  };
}

async function findDuplicateTrack(
  normalizedTitle: string,
  normalizedArtist: string,
  audioHash: string,
) {
  return prisma.track.findFirst({
    where: {
      OR: [
        {
          normalizedTitle,
          normalizedArtist,
          musicFiles: {
            some: {},
          },
        },
        {
          musicFiles: {
            some: {
              audioHash,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      artist: true,
      album: true,
      thumbnailUrl: true,
    },
  });
}

async function syncTrackTaxonomy(
  db: Prisma.TransactionClient | typeof prisma,
  trackId: string,
  genres: unknown,
  tags: unknown,
) {
  const cleanGenres = parseList(genres);
  const cleanTags = parseList(tags, true);

  await db.trackGenre.deleteMany({
    where: {
      trackId,
    },
  });

  await db.trackTag.deleteMany({
    where: {
      trackId,
    },
  });

  for (const genreName of cleanGenres) {
    const normalizedName = normalizeTitle(
      genreName,
    );

    if (!normalizedName) continue;

    const genre = await db.genre.upsert({
      where: {
        normalizedName,
      },
      update: {
        name: genreName,
      },
      create: {
        name: genreName,
        normalizedName,
      },
    });

    await db.trackGenre.create({
      data: {
        trackId,
        genreId: genre.id,
      },
    });
  }

  for (const tagName of cleanTags) {
    const normalizedName =
      tagName.toLowerCase().trim();

    if (!normalizedName) continue;

    const tag = await db.tag.upsert({
      where: {
        normalizedName,
      },
      update: {
        name: tagName,
      },
      create: {
        name: tagName,
        normalizedName,
      },
    });

    await db.trackTag.create({
      data: {
        trackId,
        tagId: tag.id,
      },
    });
  }
}

async function getMegaTrackFolder(trackId: string) {
  const musicFolder =
    await megaService.getOrCreateFolder(
      'Music',
    );

  return megaService.getOrCreateFolder(
    `track_${trackId}`,
    musicFolder,
  );
}

async function findMegaTrackFolder(trackId: string) {
  const musicFolder =
    await megaService.getFolder(
      'Music',
    );

  if (!musicFolder) {
    return null;
  }

  return megaService.getFolder(
    `track_${trackId}`,
    musicFolder,
  );
}

async function deleteMegaCoverFiles(
  trackFolder: any,
  keepNodeId?: string,
) {
  const coverFiles = (trackFolder.children || []).filter(isCoverFile);
  for (const coverFile of coverFiles) {
    const nodeId = megaService.getNodeId(coverFile);
    if (keepNodeId && nodeId === keepNodeId) continue;
    try {
      await coverFile.delete(true);
      console.log(`[ARTWORK] Deleted existing cover '${coverFile.name}'.`);
    } catch (error) {
      console.warn('[ARTWORK] Could not delete old cover:', error);
    }
  }
}

async function uploadAudioToMega(
  localPath: string,
  fileName: string,
  trackId: string,
) {
  await megaService.connect();

  const trackFolder =
    await getMegaTrackFolder(trackId);

  const storedFileName =
    normalizedAudioFileName(fileName);

  /*
   * Upload audio to MEGA only.
   *
   * IMPORTANT:
   * This function does NOT create a MusicFile database record.
   * Database work will happen later inside a Prisma transaction.
   */
  const uploadedNode =
    await megaService.uploadFile(
      localPath,
      megaService.getNodeId(trackFolder),
      storedFileName,
    );

  return {
    trackFolder,
    trackFolderId:
      megaService.getNodeId(trackFolder),
    uploadedNode,
    megaNodeId:
      megaService.getNodeId(uploadedNode),
    storedFileName,
  };
}


/**
 * Legacy helper kept temporarily for the replacement-audio route.
 *
 * Phase 4.1 changes only the new-track creation flow. The replacement
 * route still uses this helper until its staging/versioning phase is
 * implemented. Do not use this helper for new-track creation.
 */
async function uploadToMegaAndSave(
  localPath: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
  trackId: string,
  audioHash: string,
) {
  const megaAudio = await uploadAudioToMega(
    localPath,
    fileName,
    trackId,

  );

  try {
    return await prisma.musicFile.create({
      data: {
        trackId,
        megaNodeId: megaAudio.megaNodeId,
        fileName: megaAudio.storedFileName,
        mimeType,
        fileSize,
        audioHash,
      },
    });
  } catch (error) {
    try {
      await megaService.deleteFile(megaAudio.megaNodeId);
    } catch (deleteError) {
      console.warn(
        'Uploaded file could not be removed after database failure:',
        deleteError,
      );
    }

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| GET /api/admin/storage/mega
|--------------------------------------------------------------------------
*/

router.get(
  '/storage/mega',
  authenticate,
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ) => {
    if (
      !megaService.isConfigured()
    ) {
      return res
        .status(200)
        .json({
          provider: 'mega',

          configured: false,

          connected: false,

          message:
            'MEGA_EMAIL and MEGA_PASSWORD environment variables are required.',
        });
    }

    try {
      await megaService.connect();

      const musicFolder =
        await megaService.getOrCreateFolder(
          'Music',
        );

      return res
        .status(200)
        .json({
          provider: 'mega',

          configured: true,

          connected:
            megaService.isConnected(),

          musicFolder: {
            name:
              musicFolder.name,

            nodeId:
              megaService.getNodeId(
                musicFolder,
              ),
          },
        });
    } catch (
    error: any
    ) {
      return res
        .status(503)
        .json({
          provider: 'mega',

          configured: true,

          connected: false,

          error:
            error?.message ||
            'MEGA connection failed',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| POST /api/admin/tracks
|
| Create track + upload audio + upload embedded cover
|--------------------------------------------------------------------------
*/

router.post(
  '/tracks',
  authenticate,
  requireAdmin,
  adminTrackUpload,
  async (
    req: Request,
    res: Response,
  ) => {
    let tempFilePath: string | null = null;
    let createdTrackId: string | null = null;
    let uploadedAudioNodeId: string | null = null;
    let uploadedCoverNodeId: string | null = null;
    let customCover: Express.Multer.File | undefined;
    let operationId: string | null = null;
    let transactionCommitted = false;
    let normalizedTitleForError: string | null = null;
    let normalizedArtistForError: string | null = null;

    try {
      const uploadedFiles = req.files as {
        audio?: Express.Multer.File[];
        cover?: Express.Multer.File[];
      };

      const file = uploadedFiles?.audio?.[0];
      customCover = uploadedFiles?.cover?.[0];

      if (!file) {
        return res.status(400).json({
          error: 'AUDIO_REQUIRED',
          message: 'Audio file is required.',
        });
      }

      tempFilePath = file.path;

      // 1. Extract metadata before any MEGA operation.
      const metadata = await extractAudioMetadata(
        file.path,
        file.originalname,
      );

      // Keep this compatible with older/newer metadata-service return shapes.
      const richMetadata: any = metadata as any;

      console.log('[AUDIO METADATA]', {
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        duration: metadata.duration,
        hasCover: Boolean(metadata.coverBuffer),
        coverSize: metadata.coverBuffer?.length || 0,
        coverMimeType: metadata.coverMimeType,
        coverExtension: metadata.coverExtension,
        pictureCount: metadata.pictureCount,
        selectedPictureType: metadata.selectedPictureType,
      });

      // 2. Admin metadata has priority; filename is the fallback.
      const bodyTitle = String(req.body.title || '').trim();
      const bodyArtist = String(req.body.artist || '').trim();
      const bodyAlbum = String(req.body.album || '').trim();

      const fallback = inferTrackMetadata(
        file.originalname,
      );

      const finalTitle =
        bodyTitle ||
        metadata.title ||
        fallback.title;

      const finalArtist =
        bodyArtist ||
        metadata.artist ||
        fallback.artist;

      const finalAlbum =
        bodyAlbum ||
        metadata.album ||
        fallback.album;

      const finalDuration =
        metadata.duration ||
        Number(req.body.duration);

      // Metadata fields are intentionally split between Track (descriptive)
      // and MusicFile (file/codec-specific). Admin form values override tags.
      const albumArtist =
        optionalString(req.body.albumArtist) ||
        optionalString(getMetadataValue(richMetadata, 'albumArtist', 'album_artist'));

      const movie =
        optionalString(req.body.movie) ||
        optionalString(getMetadataValue(richMetadata, 'movie', 'film', 'show'));

      const releaseYear =
        optionalNumber(req.body.releaseYear) ??
        getMetadataNumber(richMetadata, 'releaseYear', 'year');

      const releaseDate =
        parseDate(req.body.releaseDate) ||
        parseDate(getMetadataValue(richMetadata, 'releaseDate', 'date'));

      const language =
        optionalString(req.body.language) ||
        optionalString(getMetadataValue(richMetadata, 'language', 'lang'));

      const explicit =
        req.body.explicit !== undefined
          ? optionalBoolean(req.body.explicit)
          : getMetadataBoolean(richMetadata, 'explicit', 'ratingExplicit', 'contentRating');

      const composer =
        optionalString(req.body.composer) ||
        optionalString(getMetadataValue(richMetadata, 'composer'));

      const copyright =
        optionalString(req.body.copyright) ||
        optionalString(getMetadataValue(richMetadata, 'copyright'));

      const publisher =
        optionalString(req.body.publisher) ||
        optionalString(getMetadataValue(richMetadata, 'publisher', 'label'));

      const description =
        optionalString(req.body.description) ||
        optionalString(getMetadataValue(richMetadata, 'description', 'comment'));

      const trackNumber =
        optionalNumber(req.body.trackNumber) ??
        getMetadataNumber(richMetadata, 'trackNumber', 'track');

      const discNumber =
        optionalNumber(req.body.discNumber) ??
        getMetadataNumber(richMetadata, 'discNumber', 'disc');

      const genres = parseList(
        req.body.genres ?? req.body.genre ?? getMetadataValue(richMetadata, 'genres', 'genre'),
      );

      const tags = parseList(
        req.body.tags ?? req.body.tag ?? getMetadataValue(richMetadata, 'tags', 'tag'),
      );

      if (
        !finalTitle ||
        !String(finalTitle).trim()
      ) {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          tempFilePath = null;
        }

        return res.status(400).json({
          error: 'INVALID_TITLE',
          message: 'Could not determine the track title.',
        });
      }

      if (
        !finalArtist ||
        !String(finalArtist).trim()
      ) {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          tempFilePath = null;
        }

        return res.status(400).json({
          error: 'INVALID_ARTIST',
          message: 'Could not determine the track artist.',
        });
      }

      if (
        !finalDuration ||
        !Number.isFinite(Number(finalDuration)) ||
        Number(finalDuration) <= 0
      ) {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          tempFilePath = null;
        }

        return res.status(400).json({
          error: 'INVALID_DURATION',
          message: 'Could not determine audio duration.',
        });
      }


      // 3. Normalize using the existing deduplication functions.
      const normTitle = normalizeTitle(
        String(finalTitle),
      );

      const normArtist = normalizeArtist(
        String(finalArtist),
      );

      normalizedTitleForError = normTitle;
      normalizedArtistForError = normArtist;

      if (!normTitle || !normArtist) {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          tempFilePath = null;
        }

        return res.status(400).json({
          error: 'INVALID_METADATA',
          message: 'Valid track title and artist are required.',
        });
      }

      // 4. Calculate SHA-256 before touching MEGA.
      const audioHash = await computeFileHash(
        tempFilePath,
      );

      // 5. Application-level duplicate check.
      const duplicateTrack =
        await findDuplicateTrack(
          normTitle,
          normArtist,
          audioHash,
        );

      if (duplicateTrack) {
        if (
          tempFilePath &&
          fs.existsSync(tempFilePath)
        ) {
          fs.unlinkSync(tempFilePath);
          tempFilePath = null;
        }

        return res
          .status(409)
          .json(
            getDuplicateResponse(
              duplicateTrack,
            ),
          );
      }

      // Create an operation record only after duplicate protection passes.
      const uploadOperation = await createUploadOperation();
      operationId = uploadOperation.id;

      await updateUploadOperation(operationId, {
        status: 'UPLOADING',
      });

      /*
       * 6. Stage all external MEGA resources before touching PostgreSQL.
       *
       * PostgreSQL cannot participate in a MEGA transaction. Therefore:
       *
       *   validate → dedupe → stage MEGA → short Prisma transaction
       *
       * If the Prisma transaction fails, the outer catch compensates by
       * deleting the newly uploaded MEGA nodes.
       */
      const stagedTrackId = crypto.randomUUID();

      /*
       * Create the MEGA track folder and upload audio using the final
       * Track UUID that will be persisted by Prisma.
       */
      const megaAudio =
        await uploadAudioToMega(
          tempFilePath,
          file.originalname,
          stagedTrackId,
        );

      uploadedAudioNodeId =
        megaAudio.megaNodeId;

      /*
       * Save the staged MEGA identifiers on the operation as soon as the
       * external upload succeeds. These values are useful for recovery if
       * the process crashes before the DB transaction starts.
       */
      await updateUploadOperation(operationId, {
        megaFolder: megaAudio.trackFolderId,
        megaAudioNodeId: uploadedAudioNodeId,
      });

      /*
       * Find the MEGA track folder and stage artwork before the DB
       * transaction. Old resources cannot be affected because this is a
       * brand-new track folder.
       */
      const trackFolder =
        megaAudio.trackFolder;

      const trackFolderId =
        megaAudio.trackFolderId;

      /*
       * 7. Stage artwork.
       *
       * Priority:
       *   manually selected cover > embedded cover
       */
      let thumbnailUrl: string | null = null;

      const coverBuffer = customCover
        ? fs.readFileSync(customCover.path)
        : metadata.coverBuffer;

      const coverMimeType = customCover
        ? customCover.mimetype
        : metadata.coverMimeType;

      const coverExtension = customCover
        ? path.extname(customCover.originalname).toLowerCase()
        : metadata.coverExtension;

      console.log('[ARTWORK] Checking artwork...', {
        source: customCover ? 'custom' : 'embedded',
        hasCover: Boolean(coverBuffer),
        size: coverBuffer?.length || 0,
        mimeType: coverMimeType,
        extension: coverExtension,
        picturesDetected: metadata.pictureCount,
        selectedPictureType: metadata.selectedPictureType,
      });

      if (
        coverBuffer &&
        coverMimeType &&
        coverExtension
      ) {
        const coverFileName =
          `cover${coverExtension}`;

        console.log(
          `[ARTWORK] Uploading ${coverFileName}...`,
        );

        const uploadedCover =
          await megaService.uploadCoverFile(
            coverBuffer,
            coverFileName,
            coverMimeType,
            trackFolderId,
          );

        uploadedCoverNodeId =
          megaService.getNodeId(
            uploadedCover,
          );

        await updateUploadOperation(
          operationId,
          {
            megaCoverNodeId:
              uploadedCoverNodeId,
          },
        );

        console.log(
          `[ARTWORK] Cover uploaded successfully: ${uploadedCoverNodeId}`,
        );

        thumbnailUrl =
          `/api/tracks/${stagedTrackId}/cover`;
      } else {
        console.log(
          '[ARTWORK] No artwork found.',
        );
      }
      

      /*
       * 8. Move the operation into DB_COMMITTING before entering the
       * short ACID transaction. This state is persisted outside the
       * transaction because the UploadOperation row itself must survive
       * a failed transaction for rollback/recovery.
       */
      await updateUploadOperation(operationId, {
        status: 'DB_COMMITTING',
      });

      /*
       * Short ACID database transaction.
       *
       * No MEGA network calls happen inside this transaction.
       * If any DB operation fails, every DB change below is rolled back.
       */
      const transactionResult =
        await prisma.$transaction(
          async (tx) => {
            let transactionTrack;

            try {
              transactionTrack =
                await tx.track.create({
                  data: {
                    id: stagedTrackId,

                    title:
                      String(finalTitle).trim(),

                    normalizedTitle:
                      normTitle,

                    artist:
                      String(finalArtist).trim(),

                    normalizedArtist:
                      normArtist,

                    album:
                      String(
                        finalAlbum || '',
                      ).trim() || null,

                    albumArtist,

                    movie,

                    releaseYear,

                    releaseDate,

                    language,

                    explicit,

                    composer,

                    copyright,

                    publisher,

                    description,

                    trackNumber,

                    discNumber,

                    duration:
                      Math.round(
                        Number(
                          finalDuration,
                        ),
                      ),

                    thumbnailUrl,

                    coverMimeType:
                      coverMimeType || null,

                    coverWidth:
                      getMetadataNumber(
                        richMetadata,
                        'coverWidth',
                        'width',
                      ),

                    coverHeight:
                      getMetadataNumber(
                        richMetadata,
                        'coverHeight',
                        'height',
                      ),
                  },
                });
            } catch (error: any) {
              if (
                error instanceof
                Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
              ) {
                /*
                 * Re-throw. The outer catch handles the duplicate response
                 * and compensating MEGA cleanup.
                 */
                throw error;
              }

              throw error;
            }

            createdTrackId =
              transactionTrack.id;

            await syncTrackArtists(
              tx,
              transactionTrack.id,
              String(finalArtist).trim(),
            );

            const technicalMetadata = {
              codec:
                optionalString(
                  getMetadataValue(
                    richMetadata,
                    'codec',
                    'codecName',
                    'format',
                  ),
                ),

              bitrate:
                getMetadataNumber(
                  richMetadata,
                  'bitrate',
                  'bitRate',
                ),

              sampleRate:
                getMetadataNumber(
                  richMetadata,
                  'sampleRate',
                  'sample_rate',
                ),

              bitsPerSample:
                getMetadataNumber(
                  richMetadata,
                  'bitsPerSample',
                  'bitDepth',
                  'bitsPerSample',
                ),

              channels:
                getMetadataNumber(
                  richMetadata,
                  'channels',
                  'channelCount',
                ),
            };

            const transactionMusicFile =
              await tx.musicFile.create({
                data: {
                  trackId:
                    transactionTrack.id,

                  megaNodeId:
                    megaAudio.megaNodeId,

                  fileName:
                    megaAudio.storedFileName,

                  mimeType:
                    file.mimetype,

                  fileSize:
                    file.size,

                  audioHash,

                  ...technicalMetadata,
                },
              });

            await syncTrackTaxonomy(
              tx,
              transactionTrack.id,
              genres,
              tags,
            );

            /*
             * The operation is completed in the SAME transaction as the
             * Track/MusicFile/taxonomy records. Therefore COMPLETED can
             * never be committed if the DB transaction itself fails.
             */
            if (!operationId) {
              throw new Error(
                'Upload operation ID is missing before DB commit.',
              );
            }

            await tx.uploadOperation.update({
              where: {
                id: operationId,
              },

              data: {
                status: 'COMPLETED',

                megaFolder:
                  megaAudio.trackFolderId,

                megaAudioNodeId:
                  uploadedAudioNodeId,

                megaCoverNodeId:
                  uploadedCoverNodeId,

                trackId:
                  transactionTrack.id,

                leaseExpiresAt:
                  null,

                lastHeartbeatAt:
                  null,
              },
            });

            return {
              track:
                transactionTrack,

              musicFile:
                transactionMusicFile,
            };
          },
        );

      transactionCommitted = true;

      const track =
        transactionResult.track;

      const musicFile =
        transactionResult.musicFile;

      /*
       * At this point the DB transaction has committed successfully.
       * Keep the response object in sync with the committed row.
       */
      createdTrackId =
        track.id;

      /*
       * Delete temporary custom cover upload.
       */
      if (
        customCover?.path &&
        fs.existsSync(
          customCover.path,
        )
      ) {
        try {
          fs.unlinkSync(
            customCover.path,
          );
        } catch { }
      }

      /*
       * Delete temporary local audio upload.
       */
      if (
        tempFilePath &&
        fs.existsSync(
          tempFilePath,
        )
      ) {
        fs.unlinkSync(
          tempFilePath,
        );

        tempFilePath =
          null;
      }

      /*
       * The transaction result is already the committed Track. Reusing it
       * avoids a second database round-trip after commit.
       */
      const finalTrack =
        track;

      try {
        await invalidateTrackCache();
      } catch (cacheError) {
        console.warn(
          '[REDIS] Cache invalidation failed after successful upload:',
          cacheError,
        );
      }

      return res
        .status(201)
        .json({
          message: thumbnailUrl
            ? 'Track, audio and cover uploaded successfully.'
            : 'Track and audio uploaded successfully. No embedded cover art was found.',

          track:
            finalTrack,

          musicFile,

          artwork: {
            uploaded:
              Boolean(
                thumbnailUrl,
              ),

            url:
              thumbnailUrl,
          },
        });
    } catch (error: any) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        'Track creation/upload error:',
        error,
      );

      /*
       * IMPORTANT:
       *
       * A committed transaction must never trigger MEGA rollback.
       * Once PostgreSQL commits, Track/MusicFile and the UploadOperation
       * are the durable state and the uploaded MEGA resources belong to
       * that committed track.
       */
      if (operationId && !transactionCommitted) {
        try {
          const rollbackResult =
            await rollbackUploadOperation(
              operationId,
              errorMessage,
              {
                megaAudioNodeId:
                  uploadedAudioNodeId,
                megaCoverNodeId:
                  uploadedCoverNodeId,
                trackId:
                  createdTrackId,
              },
            );

          if (!rollbackResult.success) {
            console.error(
              '[ROLLBACK] Cleanup completed with errors:',
              rollbackResult.errors,
            );
          }
        } catch (rollbackError) {
          /*
           * The operation row itself may be unavailable if the failure
           * occurred while persisting its MEGA node IDs. Fall back to the
           * in-memory IDs so the external resources are still compensated.
           */
          console.error(
            '[ROLLBACK] Operation-based rollback failed. Falling back to in-memory MEGA IDs:',
            rollbackError,
          );

          const fallbackRollback =
            await rollbackMegaResources({
              operationId,
              megaFolderNodeId: null,
              megaAudioNodeId: uploadedAudioNodeId,
              megaCoverNodeId: uploadedCoverNodeId,
              trackId: createdTrackId,
            });

          if (!fallbackRollback.success) {
            console.error(
              '[ROLLBACK] Fallback cleanup also failed:',
              fallbackRollback.errors,
            );
          }

          try {
            await updateUploadOperation(
              operationId,
              {
                status: fallbackRollback.success
                  ? 'ROLLED_BACK'
                  : 'FAILED',
                error: [
                  errorMessage,
                  ...fallbackRollback.errors,
                ]
                  .filter(Boolean)
                  .join('\n'),
              },
            );
          } catch (operationError) {
            console.error(
              '[UPLOAD OPERATION] Could not persist fallback rollback state:',
              operationError,
            );
          }
        }
      }

      /*
       * Handle a race where the database unique constraint rejects the
       * staged Track even though the application-level duplicate check
       * already passed. The MEGA cleanup above happens BEFORE this response.
       */
      if (
        error instanceof
        Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        normalizedTitleForError &&
        normalizedArtistForError
      ) {
        const duplicateTrack =
          await prisma.track.findFirst({
            where: {
              normalizedTitle:
                normalizedTitleForError,
              normalizedArtist:
                normalizedArtistForError,
              musicFiles: {
                some: {},
              },
            },
            select: {
              id: true,
              title: true,
              artist: true,
              album: true,
              thumbnailUrl: true,
            },
          });

        if (duplicateTrack) {
          if (
            tempFilePath &&
            fs.existsSync(tempFilePath)
          ) {
            try {
              fs.unlinkSync(tempFilePath);
            } catch { }
          }

          const duplicateResponse =
            getDuplicateResponse(
              duplicateTrack,
            );

          return res
            .status(409)
            .json(duplicateResponse);
        }
      }

      /*
       * Remove temporary custom cover upload.
       */
      const customCoverPath =
        customCover?.path ?? null;

      if (
        customCoverPath &&
        fs.existsSync(customCoverPath)
      ) {
        try {
          fs.unlinkSync(customCoverPath);
        } catch { }
      }

      /*
       * Remove temporary local audio upload.
       */
      if (
        tempFilePath &&
        fs.existsSync(tempFilePath)
      ) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch { }
      }

      /*
       * If the transaction already committed, do not report a rollback.
       * This branch is defensive for future post-commit code additions.
       */
      if (transactionCommitted) {
        return res
          .status(500)
          .json({
            error: errorMessage ||
              'Track was committed, but the request could not be finalized.',
          });
      }

      return res
        .status(500)
        .json({
          error:
            errorMessage ||
            'Internal server error uploading track.',
        });
    }
  },
);

/*
 * |--------------------------------------------------------------------------
 * | POST /api/admin/tracks/:id/audio
 * |
 * | Safe replacement of audio + optionally embedded cover
 * |--------------------------------------------------------------------------
 */
router.post(
  '/tracks/:id/audio',
  authenticate,
  requireAdmin,
  upload.single('audio'),
  async (
    req: Request,
    res: Response,
  ) => {
    let tempFilePath: string | null = null;

    let operationId: string | null = null;

    let uploadedAudioNodeId: string | null = null;

    let uploadedCoverNodeId: string | null = null;

    let transactionCommitted = false;

    let audioHash: string | null = null;

    try {
      const { id } = req.params;

      const file = req.file;

      if (!file) {
        return res
          .status(400)
          .json({
            error: 'Audio file is required',
          });
      }

      tempFilePath = file.path;

      /*
       * ------------------------------------------------------------------
       * 1. Load existing track
       * ------------------------------------------------------------------
       */
      const track =
        await prisma.track.findUnique({
          where: {
            id,
          },
        });

      if (!track) {
        if (
          tempFilePath &&
          fs.existsSync(tempFilePath)
        ) {
          try {
            fs.unlinkSync(tempFilePath);
          } catch { }
        }

        tempFilePath = null;

        return res
          .status(404)
          .json({
            error: 'Track not found',
          });
      }

      /*
       * ------------------------------------------------------------------
       * 2. Extract metadata + artwork
       * ------------------------------------------------------------------
       */
      const metadata =
        await extractAudioMetadata(
          file.path,
          file.originalname,
        );

      const richMetadata: any =
        metadata as any;

      const albumArtist =
        optionalString(
          req.body.albumArtist,
        ) ||
        optionalString(
          getMetadataValue(
            richMetadata,
            'albumArtist',
            'album_artist',
          ),
        );

      const movie =
        optionalString(
          req.body.movie,
        ) ||
        optionalString(
          getMetadataValue(
            richMetadata,
            'movie',
            'film',
            'show',
          ),
        );

      const releaseYear =
        req.body.releaseYear !== undefined
          ? optionalNumber(
            req.body.releaseYear,
          )
          : getMetadataNumber(
            richMetadata,
            'releaseYear',
            'year',
          );

      const releaseDate =
        req.body.releaseDate !== undefined
          ? parseDate(
            req.body.releaseDate,
          )
          : parseDate(
            getMetadataValue(
              richMetadata,
              'releaseDate',
              'date',
            ),
          );

      const language =
        optionalString(
          req.body.language,
        ) ||
        optionalString(
          getMetadataValue(
            richMetadata,
            'language',
            'lang',
          ),
        );

      const explicit =
        req.body.explicit !== undefined
          ? optionalBoolean(
            req.body.explicit,
          )
          : getMetadataBoolean(
            richMetadata,
            'explicit',
            'ratingExplicit',
            'contentRating',
          );

      const composer =
        optionalString(
          req.body.composer,
        ) ||
        optionalString(
          getMetadataValue(
            richMetadata,
            'composer',
          ),
        );

      const copyright =
        optionalString(
          req.body.copyright,
        ) ||
        optionalString(
          getMetadataValue(
            richMetadata,
            'copyright',
          ),
        );

      const publisher =
        optionalString(
          req.body.publisher,
        ) ||
        optionalString(
          getMetadataValue(
            richMetadata,
            'publisher',
            'label',
          ),
        );

      const description =
        optionalString(
          req.body.description,
        ) ||
        optionalString(
          getMetadataValue(
            richMetadata,
            'description',
            'comment',
          ),
        );

      const trackNumber =
        req.body.trackNumber !== undefined
          ? optionalNumber(
            req.body.trackNumber,
          )
          : getMetadataNumber(
            richMetadata,
            'trackNumber',
            'track',
          );

      const discNumber =
        req.body.discNumber !== undefined
          ? optionalNumber(
            req.body.discNumber,
          )
          : getMetadataNumber(
            richMetadata,
            'discNumber',
            'disc',
          );

      const genres = parseList(
        req.body.genres ??
        req.body.genre ??
        getMetadataValue(
          richMetadata,
          'genres',
          'genre',
        ),
      );

      const tags = parseList(
        req.body.tags ??
        req.body.tag ??
        getMetadataValue(
          richMetadata,
          'tags',
          'tag',
        ),
      );

      console.log(
        '[AUDIO REPLACEMENT METADATA]',
        {
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          duration: metadata.duration,
          hasCover: Boolean(
            metadata.coverBuffer,
          ),
          coverSize:
            metadata.coverBuffer?.length ||
            0,
          coverMimeType:
            metadata.coverMimeType,
          coverExtension:
            metadata.coverExtension,
          pictureCount:
            metadata.pictureCount,
          selectedPictureType:
            metadata.selectedPictureType,
          genres,
          tags,
        },
      );

      /*
       * ------------------------------------------------------------------
       * 3. Calculate the new audio hash BEFORE touching old resources
       * ------------------------------------------------------------------
       */
      audioHash =
        await computeFileHash(
          tempFilePath,
        );

      /*
       * ------------------------------------------------------------------
       * 4. Application-level duplicate protection
       *
       * Exclude current track because replacing the track with the same
       * binary audio is not a cross-track duplicate.
       * ------------------------------------------------------------------
       */
      const duplicateFile =
        await prisma.musicFile.findFirst({
          where: {
            audioHash,
            NOT: {
              trackId: track.id,
            },
          },
          select: {
            trackId: true,
            track: {
              select: {
                id: true,
                title: true,
                artist: true,
                album: true,
                thumbnailUrl: true,
              },
            },
          },
        });

      if (duplicateFile?.track) {
        if (
          tempFilePath &&
          fs.existsSync(tempFilePath)
        ) {
          try {
            fs.unlinkSync(
              tempFilePath,
            );
          } catch { }
        }

        tempFilePath = null;

        return res
          .status(409)
          .json(
            getDuplicateResponse(
              duplicateFile.track,
            ),
          );
      }

      /*
       * ------------------------------------------------------------------
       * 5. Load current MusicFile
       * ------------------------------------------------------------------
       */
      const existingFile =
        await prisma.musicFile.findFirst({
          where: {
            trackId: track.id,
          },
        });

      /*
       * ------------------------------------------------------------------
       * 6. Locate current MEGA track folder
       *
       * Nothing is deleted yet.
       * ------------------------------------------------------------------
       */
      await megaService.connect();

      const trackFolder =
        await getMegaTrackFolder(
          track.id,
        );

      const trackFolderId =
        megaService.getNodeId(
          trackFolder,
        );

      const oldMegaAudioNodeId =
        existingFile?.megaNodeId ??
        null;

      const existingCover =
        (trackFolder.children || [])
          .filter(isCoverFile)[0];

      const oldMegaCoverNodeId =
        existingCover
          ? megaService.getNodeId(
            existingCover,
          )
          : null;

      /*
       * ------------------------------------------------------------------
       * 7. Create persistent replacement operation
       * ------------------------------------------------------------------
       */
      const operation =
        await createUploadOperation({
          type:
            UploadOperationType.REPLACE_AUDIO,

          trackId:
            track.id,
        });

      operationId = operation.id;

      await updateUploadOperation(
        operationId,
        {
          status:
            UploadStatus.UPLOADING,

          megaFolder:
            trackFolderId,

          trackId:
            track.id,

          oldMegaAudioNodeId,

          oldMegaCoverNodeId,
        },
      );

      console.log(
        `[AUDIO REPLACEMENT] Operation ${operationId} started.`,
      );

      /*
       * ------------------------------------------------------------------
       * 8. Upload NEW audio first
       *
       * Old audio remains untouched.
       * Use a unique filename to avoid collision in the track folder.
       * ------------------------------------------------------------------
       */
      const audioExtension =
        path
          .extname(
            file.originalname,
          )
          .toLowerCase() ||
        '.mp3';

      const stagedAudioFileName =
        `audio-replacement-${operationId}${audioExtension}`;

      console.log(
        `[AUDIO REPLACEMENT] Uploading new audio as ${stagedAudioFileName}...`,
      );

      const uploadedAudio =
        await megaService.uploadFile(
          tempFilePath,
          trackFolderId,
          stagedAudioFileName,
        );

      uploadedAudioNodeId =
        megaService.getNodeId(
          uploadedAudio,
        );

      await updateUploadOperation(
        operationId,
        {
          megaAudioNodeId:
            uploadedAudioNodeId,
        },
      );

      console.log(
        `[AUDIO REPLACEMENT] New audio uploaded: ${uploadedAudioNodeId}`,
      );

      /*
       * ------------------------------------------------------------------
       * 9. Upload NEW cover, when embedded artwork exists
       *
       * The old cover is intentionally kept until the DB transaction
       * commits successfully.
       * ------------------------------------------------------------------
       */
      let thumbnailUrl =
        track.thumbnailUrl;

      let newCoverMimeType =
        track.coverMimeType;

      let newCoverWidth =
        track.coverWidth;

      let newCoverHeight =
        track.coverHeight;

      if (
        metadata.coverBuffer &&
        metadata.coverMimeType &&
        metadata.coverExtension
      ) {
        const coverFileName =
          `cover${metadata.coverExtension}`;

        console.log(
          `[ARTWORK] Uploading replacement ${coverFileName}...`,
        );

        const uploadedCover =
          await megaService.uploadCoverFile(
            metadata.coverBuffer,
            coverFileName,
            metadata.coverMimeType,
            trackFolderId,
          );

        uploadedCoverNodeId =
          megaService.getNodeId(
            uploadedCover,
          );

        await updateUploadOperation(
          operationId,
          {
            megaCoverNodeId:
              uploadedCoverNodeId,
          },
        );

        thumbnailUrl =
          `/api/tracks/${track.id}/cover`;

        newCoverMimeType =
          metadata.coverMimeType;

        newCoverWidth =
          getMetadataNumber(
            richMetadata,
            'coverWidth',
            'width',
          ) ?? track.coverWidth;

        newCoverHeight =
          getMetadataNumber(
            richMetadata,
            'coverHeight',
            'height',
          ) ?? track.coverHeight;

        console.log(
          `[ARTWORK] New cover uploaded: ${uploadedCoverNodeId}`,
        );
      } else {
        console.log(
          '[ARTWORK] New audio has no embedded artwork. Existing cover will be preserved.',
        );
      }

      /*
       * ------------------------------------------------------------------
       * 10. Mark operation as entering DB commit phase
       * ------------------------------------------------------------------
       */
      await updateUploadOperation(
        operationId,
        {
          status:
            UploadStatus.DB_COMMITTING,
        },
      );

      /*
       * ------------------------------------------------------------------
       * 11. SHORT DATABASE TRANSACTION
       *
       * No MEGA network calls occur inside this transaction.
       * ------------------------------------------------------------------
       */
      const transactionResult =
        await prisma.$transaction(
          async (tx) => {
            let committedMusicFile;

            const technicalMetadata = {
              codec:
                optionalString(
                  getMetadataValue(
                    richMetadata,
                    'codec',
                    'codecName',
                    'format',
                  ),
                ),

              bitrate:
                getMetadataNumber(
                  richMetadata,
                  'bitrate',
                  'bitRate',
                ),

              sampleRate:
                getMetadataNumber(
                  richMetadata,
                  'sampleRate',
                  'sample_rate',
                ),

              bitsPerSample:
                getMetadataNumber(
                  richMetadata,
                  'bitsPerSample',
                  'bitDepth',
                ),

              channels:
                getMetadataNumber(
                  richMetadata,
                  'channels',
                  'channelCount',
                ),
            };

            if (existingFile) {
              committedMusicFile =
                await tx.musicFile.update({
                  where: {
                    id:
                      existingFile.id,
                  },

                  data: {
                    megaNodeId:
                      uploadedAudioNodeId!,

                    fileName:
                      stagedAudioFileName,

                    mimeType:
                      file.mimetype,

                    fileSize:
                      file.size,

                    audioHash:
                      audioHash!,

                    ...technicalMetadata,
                  },
                });
            } else {
              committedMusicFile =
                await tx.musicFile.create({
                  data: {
                    trackId:
                      track.id,

                    megaNodeId:
                      uploadedAudioNodeId!,

                    fileName:
                      stagedAudioFileName,

                    mimeType:
                      file.mimetype,

                    fileSize:
                      file.size,

                    audioHash:
                      audioHash!,

                    ...technicalMetadata,
                  },
                });
            }

            const committedTrack =
              await tx.track.update({
                where: {
                  id: track.id,
                },

                data: {
                  duration:
                    metadata.duration ||
                    track.duration,

                  albumArtist,

                  movie,

                  releaseYear,

                  releaseDate,

                  language,

                  explicit,

                  composer,

                  copyright,

                  publisher,

                  description,

                  trackNumber,

                  discNumber,

                  coverMimeType:
                    newCoverMimeType,

                  coverWidth:
                    newCoverWidth,

                  coverHeight:
                    newCoverHeight,

                  thumbnailUrl,
                },
              });

            await tx.uploadOperation.update({
              where: {
                id:
                  operationId!,
              },

              data: {
                status:
                  UploadStatus.COMPLETED,

                error:
                  null,

                leaseExpiresAt:
                  null,

                lastHeartbeatAt:
                  null,
              },
            });

            return {
              track:
                committedTrack,

              musicFile:
                committedMusicFile,
            };
          },
        );

      transactionCommitted = true;

      console.log(
        `[AUDIO REPLACEMENT] DB transaction committed for operation ${operationId}.`,
      );

      /*
       * ------------------------------------------------------------------
       * 12. Delete OLD MEGA resources ONLY AFTER DB COMMIT
       * ------------------------------------------------------------------
       */
      if (
        oldMegaAudioNodeId &&
        oldMegaAudioNodeId !==
        uploadedAudioNodeId
      ) {
        try {
          await megaService.deleteFile(
            oldMegaAudioNodeId,
          );

          console.log(
            `[AUDIO REPLACEMENT] Old audio deleted: ${oldMegaAudioNodeId}`,
          );
        } catch (cleanupError) {
          console.warn(
            '[AUDIO REPLACEMENT] Could not delete old audio after commit:',
            cleanupError,
          );
        }
      }

      /*
       * Delete old cover(s) only when a new cover was actually uploaded.
       */
      if (uploadedCoverNodeId) {
        try {
          const refreshedTrackFolder =
            await getMegaTrackFolder(
              track.id,
            );

          await deleteMegaCoverFiles(
            refreshedTrackFolder,
            uploadedCoverNodeId,
          );

          console.log(
            `[ARTWORK] Old cover cleanup completed. Kept ${uploadedCoverNodeId}.`,
          );
        } catch (cleanupError) {
          console.warn(
            '[ARTWORK] Could not complete old-cover cleanup:',
            cleanupError,
          );
        }
      }

      /*
       * ------------------------------------------------------------------
       * 13. Remove local temporary upload
       * ------------------------------------------------------------------
       */
      if (
        tempFilePath &&
        fs.existsSync(tempFilePath)
      ) {
        try {
          fs.unlinkSync(
            tempFilePath,
          );
        } catch { }
      }

      tempFilePath = null;

      /*
       * ------------------------------------------------------------------
       * 14. Cache invalidation
       *
       * Cache failure must not roll back already committed DB/MEGA state.
       * ------------------------------------------------------------------
       */
      try {
        await invalidateTrackCache();
        await invalidateAllFavoritesCaches();
      } catch (cacheError) {
        console.warn(
          '[AUDIO REPLACEMENT] Cache invalidation failed after successful commit:',
          cacheError,
        );
      }

      /*
       * ------------------------------------------------------------------
       * 15. Return successful replacement
       * ------------------------------------------------------------------
       */
      return res
        .status(200)
        .json({
          message:
            'Audio file uploaded/replaced successfully',

          track:
            transactionResult.track,

          musicFile:
            transactionResult.musicFile,

          artwork: {
            uploaded:
              Boolean(
                uploadedCoverNodeId,
              ),

            url:
              transactionResult.track
                .thumbnailUrl,
          },

          operationId,
        });
    } catch (error: any) {
      if (isTrackOperationInProgressError(error)) {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          try {
            fs.unlinkSync(tempFilePath);
          } catch { }
        }

        tempFilePath = null;
        return sendTrackOperationConflict(res);
      }

      console.error(
        '[AUDIO REPLACEMENT] Upload error:',
        error,
      );

      /*
       * ------------------------------------------------------------------
       * Before DB commit:
       *   Delete ONLY newly uploaded resources.
       *
       * Old audio/cover remain untouched.
       * ------------------------------------------------------------------
       */
      if (
        operationId &&
        !transactionCommitted
      ) {
        try {
          const rollbackResult =
            await rollbackUploadOperation(
              operationId,
              error,
              {
                megaAudioNodeId:
                  uploadedAudioNodeId,

                megaCoverNodeId:
                  uploadedCoverNodeId,

                trackId:
                  req.params.id,
              },
            );

          console.log(
            '[AUDIO REPLACEMENT] Rollback result:',
            rollbackResult,
          );
        } catch (rollbackError) {
          console.error(
            '[AUDIO REPLACEMENT] Rollback itself failed:',
            rollbackError,
          );
        }
      }

      /*
       * Remove temporary local upload.
       */
      if (
        tempFilePath &&
        fs.existsSync(tempFilePath)
      ) {
        try {
          fs.unlinkSync(
            tempFilePath,
          );
        } catch { }
      }

      /*
       * Handle a race where the database unique constraint rejects the
       * new audioHash even though the application-level duplicate check
       * already passed.
       */
      if (
        error instanceof
        Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        audioHash
      ) {
        const conflictingFile =
          await prisma.musicFile.findFirst({
            where: {
              audioHash,
              NOT: {
                trackId:
                  req.params.id,
              },
            },

            select: {
              track: {
                select: {
                  id: true,
                  title: true,
                  artist: true,
                  album: true,
                  thumbnailUrl: true,
                },
              },
            },
          }).catch(() => null);

        if (
          conflictingFile?.track
        ) {
          return res
            .status(409)
            .json(
              getDuplicateResponse(
                conflictingFile.track,
              ),
            );
        }
      }

      /*
       * Once the DB transaction has committed, never claim that the track
       * was rolled back.
       */
      if (transactionCommitted) {
        return res
          .status(500)
          .json({
            error:
              error?.message ||
              'Track was committed, but the request could not be finalized.',
          });
      }

      return res
        .status(500)
        .json({
          error:
            error?.message ||
            'Internal server error uploading audio',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| DELETE /api/admin/tracks/:id/audio
|--------------------------------------------------------------------------
*/

router.delete(
  '/tracks/:id/audio',
  authenticate,
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ) => {
    let operationId: string | null = null;
    let transactionCommitted = false;

    try {
      const { id } = req.params;

      /*
       * ------------------------------------------------------------------
       * 1. Load the current audio record.
       * ------------------------------------------------------------------
       */
      const existingFile =
        await prisma.musicFile.findFirst({
          where: {
            trackId:
              id,
          },
        });

      if (!existingFile) {
        return res
          .status(404)
          .json({
            error:
              'No audio file associated with this track',
          });
      }

      /*
       * ------------------------------------------------------------------
       * 2. Locate the MEGA track folder.
       *
       * Nothing is deleted yet.
       * ------------------------------------------------------------------
       */
      await megaService.connect();

      const trackFolder =
        await findMegaTrackFolder(id);

      const trackFolderId =
        trackFolder
          ? megaService.getNodeId(
            trackFolder,
          )
          : null;

      const oldMegaAudioNodeId =
        existingFile.megaNodeId;

      /*
       * ------------------------------------------------------------------
       * 3. Create persistent DELETE_AUDIO operation.
       *
       * The old MEGA node ID is stored before the DB deletion so startup
       * recovery can finish the external cleanup after a crash.
       * ------------------------------------------------------------------
       */
      const operation =
        await createUploadOperation({
          type:
            UploadOperationType.DELETE_AUDIO,

          trackId:
            id,
        });

      operationId =
        operation.id;

      await updateUploadOperation(
        operationId,
        {
          status:
            UploadStatus.DB_COMMITTING,

          megaFolder:
            trackFolderId,

          trackId:
            id,

          oldMegaAudioNodeId,
        },
      );

      console.log(
        `[DELETE AUDIO] Operation ${operationId} started for track ${id}.`,
      );

      /*
       * ------------------------------------------------------------------
       * 4. SHORT DATABASE TRANSACTION
       *
       * Delete only the PostgreSQL MusicFile row. Do not make MEGA calls
       * inside the transaction.
       * ------------------------------------------------------------------
       */
      await prisma.$transaction(
        async (tx) => {
          await tx.musicFile.delete({
            where: {
              id:
                existingFile.id,
            },
          });

          /*
           * The DB deletion is now durable only when this transaction
           * commits. The operation must remain ROLLING_BACK until the
           * MEGA node itself has been deleted.
           */
          await tx.uploadOperation.update({
            where: {
              id:
                operationId!,
            },

            data: {
              status:
                UploadStatus.ROLLING_BACK,

              error:
                null,
            },
          });
        },
      );

      transactionCommitted =
        true;

      console.log(
        `[DELETE AUDIO] Database transaction committed for operation ${operationId}.`,
      );

      /*
       * ------------------------------------------------------------------
       * 5. Delete OLD MEGA audio after DB commit.
       *
       * The cleanup service reads the persisted old node ID, so this step
       * is recoverable if the process crashes before completion.
       * ------------------------------------------------------------------
       */
      const cleanupResult =
        await cleanupDeletedAudioOperation(
          operationId,
          undefined,
          {
            megaFolderNodeId:
              trackFolderId,

            oldMegaAudioNodeId:
              oldMegaAudioNodeId,

            trackId:
              id,
          },
        );

      if (!cleanupResult.success) {
        console.error(
          `[DELETE AUDIO] MEGA cleanup incomplete for operation ${operationId}:`,
          cleanupResult.errors,
        );

        return res
          .status(500)
          .json({
            error:
              'Audio was deleted from the database, but storage cleanup is incomplete.',
            operationId,
            cleanupErrors:
              cleanupResult.errors,
          });
      }

      /*
       * ------------------------------------------------------------------
       * 6. Cache invalidation.
       *
       * Cache failure must never turn a successful deletion into a
       * database rollback.
       * ------------------------------------------------------------------
       */
      try {
        await invalidateTrackCache();
        await invalidateAllFavoritesCaches();
      } catch (cacheError) {
        console.warn(
          '[DELETE AUDIO] Cache invalidation failed after successful deletion:',
          cacheError,
        );
      }

      console.log(
        `[DELETE AUDIO] Operation ${operationId} completed successfully.`,
      );

      return res
        .status(200)
        .json({
          message:
            'Audio file deleted successfully',

          operationId,
        });
    } catch (error: any) {
      if (isTrackOperationInProgressError(error)) {
        return sendTrackOperationConflict(res);
      }

      console.error(
        '[DELETE AUDIO] Delete error:',
        error,
      );

      /*
       * Before DB commit:
       *   old MEGA audio remains untouched.
       *
       * After DB commit:
       *   never attempt to restore the MusicFile here. The operation row
       *   remains the durable source of truth for external cleanup.
       */
      if (transactionCommitted) {
        return res
          .status(500)
          .json({
            error:
              error?.message ||
              'Audio was deleted, but the request could not be finalized.',

            operationId,
          });
      }

      if (operationId) {
        try {
          await prisma.uploadOperation.update({
            where: {
              id:
                operationId,
            },

            data: {
              status:
                UploadStatus.FAILED,

              error:
                error?.message ||
                'Audio deletion transaction failed.',
              leaseExpiresAt: null,
              lastHeartbeatAt: null,
            },
          });
        } catch (operationError) {
          console.warn(
            '[DELETE AUDIO] Could not persist failed operation state:',
            operationError,
          );
        }
      }

      return res
        .status(500)
        .json({
          error:
            error?.message ||
            'Internal server error deleting audio file',
        });
    }
  },
);

/*
 * --------------------------------------------------------------------------
 * POST /api/admin/tracks/:id/cover
 * --------------------------------------------------------------------------
 */
router.post(
  '/tracks/:id/cover',
  authenticate,
  requireAdmin,
  upload.single('cover'),
  async (req: Request, res: Response) => {
    let uploadedCoverNodeId: string | null = null;

    try {
      const { id } = req.params;
      const file = req.file;

      const cleanup = () => {
        if (file?.path && fs.existsSync(file.path)) {
          try { fs.unlinkSync(file.path); } catch { }
        }
      };

      if (!file) {
        return res.status(400).json({
          error: 'COVER_REQUIRED',
          message: 'Cover image is required.',
        });
      }

      const track = await prisma.track.findUnique({ where: { id } });
      if (!track) {
        cleanup();
        return res.status(404).json({ error: 'Track not found' });
      }

      const allowedExtensions = new Set([
        '.jpg', '.jpeg', '.png', '.webp', '.gif',
      ]);
      const extension = path.extname(file.originalname).toLowerCase();

      if (!file.mimetype.startsWith('image/')) {
        cleanup();
        return res.status(400).json({
          error: 'INVALID_COVER_TYPE',
          message: 'Only image files are allowed as cover artwork.',
        });
      }

      if (!allowedExtensions.has(extension)) {
        cleanup();
        return res.status(400).json({
          error: 'INVALID_COVER_EXTENSION',
          message: 'Supported cover formats are JPG, JPEG, PNG, WEBP and GIF.',
        });
      }

      const coverBuffer = fs.readFileSync(file.path);
      if (!coverBuffer.length) {
        cleanup();
        return res.status(400).json({
          error: 'EMPTY_COVER',
          message: 'The uploaded cover image is empty.',
        });
      }

      await megaService.connect();
      const trackFolder = await getMegaTrackFolder(id);
      const folderId = megaService.getNodeId(trackFolder);

      // Upload first; old artwork is removed only after the new node exists.
      const uploadedCover = await megaService.uploadCoverFile(
        coverBuffer,
        `cover${extension}`,
        file.mimetype,
        folderId,
      );
      uploadedCoverNodeId = megaService.getNodeId(uploadedCover);

      await deleteMegaCoverFiles(trackFolder, uploadedCoverNodeId);

      const thumbnailUrl = `/api/tracks/${id}/cover`;
      const updatedTrack = await prisma.track.update({
        where: { id },
        data: {
          thumbnailUrl,
          coverMimeType: file.mimetype,
        },
      });

      cleanup();

      await invalidateTrackCache();
      await invalidateAllFavoritesCaches();

      return res.status(200).json({
        message: 'Cover uploaded successfully.',
        track: updatedTrack,
        artwork: {
          uploaded: true,
          url: thumbnailUrl,
          mimeType: file.mimetype,
        },
      });
    } catch (error: any) {
      console.error('Cover upload error:', error);

      if (uploadedCoverNodeId) {
        try {
          await megaService.deleteFile(uploadedCoverNodeId);
        } catch (deleteError) {
          console.warn('Could not remove failed cover upload:', deleteError);
        }
      }

      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch { }
      }

      return res.status(500).json({
        error: error?.message || 'Internal server error uploading cover',
      });
    }
  },
);

/*
 * --------------------------------------------------------------------------
 * DELETE /api/admin/tracks/:id/cover
 * --------------------------------------------------------------------------
 */
router.delete(
  '/tracks/:id/cover',
  authenticate,
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ) => {
    let operationId: string | null = null;
    let transactionCommitted = false;

    try {
      const { id } = req.params;

      /*
       * ------------------------------------------------------------------
       * 1. Load the track.
       * ------------------------------------------------------------------
       */
      const track =
        await prisma.track.findUnique({
          where: {
            id,
          },

          select: {
            id: true,
          },
        });

      if (!track) {
        return res
          .status(404)
          .json({
            error:
              'Track not found',
          });
      }

      /*
       * ------------------------------------------------------------------
       * 2. Locate the current MEGA cover.
       *
       * Nothing is deleted yet.
       * ------------------------------------------------------------------
       */
      await megaService.connect();

      const trackFolder =
        await findMegaTrackFolder(id);

      const trackFolderId =
        trackFolder
          ? megaService.getNodeId(
            trackFolder,
          )
          : null;

      let oldMegaCoverNodeId:
        string | null = null;

      if (trackFolder) {
        const existingCover =
          (trackFolder.children || [])
            .filter(isCoverFile)[0];

        if (existingCover) {
          oldMegaCoverNodeId =
            megaService.getNodeId(
              existingCover,
            );
        }
      }

      /*
       * If there is neither a MEGA cover nor a DB cover reference, the
       * request is idempotently resolved as "no cover present". We still
       * clear the DB reference below when needed.
       */
      const currentTrack =
        await prisma.track.findUnique({
          where: {
            id,
          },

          select: {
            thumbnailUrl: true,
            coverMimeType: true,
            coverWidth: true,
            coverHeight: true,
          },
        });

      const hasDbCoverReference =
        Boolean(
          currentTrack?.thumbnailUrl ||
          currentTrack?.coverMimeType ||
          currentTrack?.coverWidth ||
          currentTrack?.coverHeight,
        );

      if (
        !oldMegaCoverNodeId &&
        !hasDbCoverReference
      ) {
        return res
          .status(200)
          .json({
            message:
              'No cover is associated with this track.',

            artwork: {
              uploaded: false,
              url: null,
            },
          });
      }

      /*
       * ------------------------------------------------------------------
       * 3. Create persistent DELETE_COVER operation.
       *
       * The old MEGA node ID is persisted before the DB update so startup
       * recovery can finish the external cleanup after a crash.
       * ------------------------------------------------------------------
       */
      const operation =
        await createUploadOperation({
          type:
            UploadOperationType.DELETE_COVER,

          trackId:
            id,
        });

      operationId =
        operation.id;

      await updateUploadOperation(
        operationId,
        {
          status:
            UploadStatus.DB_COMMITTING,

          megaFolder:
            trackFolderId,

          trackId:
            id,

          oldMegaCoverNodeId,
        },
      );

      console.log(
        `[DELETE COVER] Operation ${operationId} started for track ${id}.`,
      );

      /*
       * ------------------------------------------------------------------
       * 4. SHORT DATABASE TRANSACTION
       *
       * Clear the cover reference/metadata only. No MEGA calls occur
       * inside the transaction.
       * ------------------------------------------------------------------
       */
      const updatedTrack =
        await prisma.$transaction(
          async (tx) => {
            const result =
              await tx.track.update({
                where: {
                  id,
                },

                data: {
                  thumbnailUrl:
                    null,

                  coverMimeType:
                    null,

                  coverWidth:
                    null,

                  coverHeight:
                    null,
                },
              });

            await tx.uploadOperation.update({
              where: {
                id:
                  operationId!,
              },

              data: {
                status:
                  UploadStatus.ROLLING_BACK,

                error:
                  null,
              },
            });

            return result;
          },
        );

      transactionCommitted =
        true;

      console.log(
        `[DELETE COVER] Database transaction committed for operation ${operationId}.`,
      );

      /*
       * ------------------------------------------------------------------
       * 5. Delete OLD MEGA cover after DB commit.
       *
       * If no old node exists, cleanup is still considered successful
       * because the database reference has already been cleared.
       * ------------------------------------------------------------------
       */
      const cleanupResult =
        await cleanupDeletedCoverOperation(
          operationId,
          undefined,
          {
            megaFolderNodeId:
              trackFolderId,

            oldMegaCoverNodeId:
              oldMegaCoverNodeId,

            trackId:
              id,
          },
        );

      if (!cleanupResult.success) {
        console.error(
          `[DELETE COVER] MEGA cleanup incomplete for operation ${operationId}:`,
          cleanupResult.errors,
        );

        return res
          .status(500)
          .json({
            error:
              'Cover reference was cleared from the database, but storage cleanup is incomplete.',

            operationId,

            cleanupErrors:
              cleanupResult.errors,
          });
      }

      /*
       * ------------------------------------------------------------------
       * 6. Cache invalidation.
       * ------------------------------------------------------------------
       */
      try {
        await invalidateTrackCache();
        await invalidateAllFavoritesCaches();
      } catch (cacheError) {
        console.warn(
          '[DELETE COVER] Cache invalidation failed after successful deletion:',
          cacheError,
        );
      }

      console.log(
        `[DELETE COVER] Operation ${operationId} completed successfully.`,
      );

      return res
        .status(200)
        .json({
          message:
            oldMegaCoverNodeId
              ? 'Cover deleted successfully.'
              : 'Cover reference cleared. No cover file was found.',

          track:
            updatedTrack,

          artwork: {
            uploaded: false,
            url: null,
          },

          operationId,
        });
    } catch (error: any) {
      if (isTrackOperationInProgressError(error)) {
        return sendTrackOperationConflict(res);
      }

      console.error(
        '[DELETE COVER] Delete error:',
        error,
      );

      /*
       * Before DB commit:
       *   old MEGA cover remains untouched.
       *
       * After DB commit:
       *   never attempt to restore the DB cover reference here. The
       *   operation row remains the durable source of truth for cleanup.
       */
      if (transactionCommitted) {
        return res
          .status(500)
          .json({
            error:
              error?.message ||
              'Cover reference was cleared, but the request could not be finalized.',

            operationId,
          });
      }

      if (operationId) {
        try {
          await prisma.uploadOperation.update({
            where: {
              id:
                operationId,
            },

            data: {
              status:
                UploadStatus.FAILED,

              error:
                error?.message ||
                'Cover deletion transaction failed.',
              leaseExpiresAt: null,
              lastHeartbeatAt: null,
            },
          });
        } catch (operationError) {
          console.warn(
            '[DELETE COVER] Could not persist failed operation state:',
            operationError,
          );
        }
      }

      return res
        .status(500)
        .json({
          error:
            error?.message ||
            'Internal server error deleting cover',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| DELETE /api/admin/tracks/:id
|--------------------------------------------------------------------------
*/

router.delete(
  '/tracks/:id',
  authenticate,
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ) => {
    let operationId: string | null = null;

    let transactionCommitted = false;

    try {
      const { id } = req.params;

      /*
       * ------------------------------------------------------------------
       * 1. Load the track and its current audio.
       * ------------------------------------------------------------------
       */
      const track =
        await prisma.track.findUnique({
          where: {
            id,
          },

          include: {
            musicFiles: true,
          },
        });

      if (!track) {
        return res
          .status(404)
          .json({
            error: 'Track not found',
          });
      }

      /*
       * ------------------------------------------------------------------
       * 2. Connect to MEGA and locate the track folder.
       *
       * Nothing is deleted yet.
       * ------------------------------------------------------------------
       */
      await megaService.connect();

      const trackFolder =
        await findMegaTrackFolder(id);

      const trackFolderId =
        trackFolder
          ? megaService.getNodeId(
            trackFolder,
          )
          : null;

      /*
       * Capture the current audio node.
       *
       * The current application normally has one MusicFile per Track.
       */
      const oldMegaAudioNodeId =
        track.musicFiles[0]
          ?.megaNodeId ?? null;

      /*
       * Capture the current cover node.
       *
       * The folder itself is NOT deleted.
       */
      let oldMegaCoverNodeId:
        string | null = null;

      if (trackFolder) {
        const existingCover =
          (trackFolder.children || [])
            .filter(isCoverFile)[0];

        if (existingCover) {
          oldMegaCoverNodeId =
            megaService.getNodeId(
              existingCover,
            );
        }
      }

      /*
       * ------------------------------------------------------------------
       * 3. Create persistent DELETE_TRACK operation.
       *
       * This must happen BEFORE the database deletion so a crash can be
       * recovered later.
       * ------------------------------------------------------------------
       */
      const operation =
        await createUploadOperation({
          type:
            UploadOperationType.DELETE_TRACK,

          trackId:
            track.id,
        });

      operationId =
        operation.id;

      await updateUploadOperation(
        operationId,
        {
          status:
            UploadStatus.DB_COMMITTING,

          megaFolder:
            trackFolderId,

          trackId:
            track.id,

          oldMegaAudioNodeId,

          oldMegaCoverNodeId,
        },
      );

      console.log(
        `[DELETE TRACK] Operation ${operationId} started for track ${track.id}.`,
      );

      /*
       * ------------------------------------------------------------------
       * 4. DATABASE TRANSACTION
       *
       * Track + cascading relations are deleted atomically.
       *
       * We deliberately mark the operation ROLLING_BACK rather than
       * COMPLETED because MEGA cleanup has NOT happened yet.
       *
       * If the process crashes immediately after this transaction,
       * startup recovery will see the stale operation and clean MEGA.
       * ------------------------------------------------------------------
       */
      await prisma.$transaction(
        async (tx) => {
          await tx.track.delete({
            where: {
              id,
            },
          });

          await tx.uploadOperation.update({
            where: {
              id:
                operationId!,
            },

            data: {
              status:
                UploadStatus.ROLLING_BACK,

              error:
                null,
            },
          });
        },
      );

      transactionCommitted =
        true;

      console.log(
        `[DELETE TRACK] Database transaction committed for operation ${operationId}.`,
      );

      /*
       * ------------------------------------------------------------------
       * 5. Delete OLD MEGA resources after DB commit.
       *
       * cleanupDeletedTrackOperation() reads the persisted old node IDs
       * from UploadOperation, so this remains recoverable.
       * ------------------------------------------------------------------
       */
      const cleanupResult =
        await cleanupDeletedTrackOperation(
          operationId,
          undefined,
          {
            megaFolderNodeId:
              trackFolderId,

            oldMegaAudioNodeId:
              oldMegaAudioNodeId,

            oldMegaCoverNodeId:
              oldMegaCoverNodeId,

            trackId:
              track.id,
          },
        );

      if (!cleanupResult.success) {
        /*
         * The DB deletion already succeeded.
         *
         * Do not pretend the track was restored.
         * The operation remains ROLLING_BACK so startup recovery can retry.
         */
        console.error(
          `[DELETE TRACK] MEGA cleanup incomplete for operation ${operationId}:`,
          cleanupResult.errors,
        );

        return res
          .status(500)
          .json({
            error:
              'Track was deleted from the database, but storage cleanup is incomplete.',
            operationId,
            cleanupErrors:
              cleanupResult.errors,
          });
      }

      /*
       * ------------------------------------------------------------------
       * 6. Cache invalidation.
       *
       * Cache failure must not turn a successful deletion into a rollback.
       * ------------------------------------------------------------------
       */
      try {
        await invalidateTrackCache();
        await invalidateAllFavoritesCaches();
      } catch (cacheError) {
        console.warn(
          '[DELETE TRACK] Cache invalidation failed after successful deletion:',
          cacheError,
        );
      }

      console.log(
        `[DELETE TRACK] Operation ${operationId} completed successfully.`,
      );

      return res
        .status(200)
        .json({
          message:
            'Track deleted successfully',

          operationId,
        });
    } catch (error: any) {
      if (isTrackOperationInProgressError(error)) {
        return sendTrackOperationConflict(res);
      }

      console.error(
        '[DELETE TRACK] Delete error:',
        error,
      );

      /*
       * IMPORTANT:
       *
       * Before DB commit:
       *   nothing from the old track has been deleted.
       *
       * Therefore there is nothing to compensate in MEGA.
       *
       * After DB commit:
       *   never attempt to restore the Track automatically here.
       *
       * The DELETE_TRACK operation remains the source of truth for
       * external cleanup.
       */
      if (
        transactionCommitted
      ) {
        return res
          .status(500)
          .json({
            error:
              error?.message ||
              'Track was deleted, but the request could not be finalized.',

            operationId,
          });
      }

      /*
       * If the operation was created but the DB transaction failed,
       * remove the operation record only when possible.
       *
       * No MEGA deletion is necessary because the Track was never
       * committed as deleted.
       */
      if (
        operationId
      ) {
        try {
          await prisma.uploadOperation.update({
            where: {
              id:
                operationId,
            },

            data: {
              status:
                UploadStatus.FAILED,

              error:
                error?.message ||
                'Track deletion transaction failed.',
              // Terminal state → release operation lease
              leaseExpiresAt: null,
              lastHeartbeatAt: null,
            },
          });
        } catch (
        operationError
        ) {
          console.warn(
            '[DELETE TRACK] Could not persist failed operation state:',
            operationError,
          );
        }
      }

      return res
        .status(500)
        .json({
          error:
            error?.message ||
            'Internal server error deleting track',
        });
    }
  },
);

/*
 * --------------------------------------------------------------------------
 * PATCH /api/admin/tracks/:id
 * --------------------------------------------------------------------------
 */
router.patch(
  '/tracks/:id',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        title,
        artist,
        album,
        albumArtist,
        movie,
        releaseYear,
        releaseDate,
        language,
        explicit,
        composer,
        copyright,
        publisher,
        description,
        trackNumber,
        discNumber,
        duration,
        thumbnailUrl,
        genres,
        tags,
      } = req.body;

      const track = await prisma.track.findUnique({ where: { id } });
      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }

      const data: Record<string, unknown> = {};

      if (title !== undefined) {
        const cleanTitle = String(title).trim();
        const normalizedTitle = normalizeTitle(cleanTitle);
        if (!cleanTitle || !normalizedTitle) {
          return res.status(400).json({
            error: 'INVALID_TITLE',
            message: 'Track title cannot be empty.',
          });
        }
        data.title = cleanTitle;
        data.normalizedTitle = normalizedTitle;
      }

      if (artist !== undefined) {
        const cleanArtist = String(artist).trim();
        const normalizedArtist = normalizeArtist(cleanArtist);
        if (!cleanArtist || !normalizedArtist) {
          return res.status(400).json({
            error: 'INVALID_ARTIST',
            message: 'Track artist cannot be empty.',
          });
        }
        data.artist = cleanArtist;
        data.normalizedArtist = normalizedArtist;
      }

      if (album !== undefined) {
        data.album = optionalString(album);
      }

      if (duration !== undefined) {
        const parsedDuration = optionalNumber(duration);
        if (parsedDuration === null) {
          return res.status(400).json({
            error: 'INVALID_DURATION',
            message: 'Duration must be greater than zero.',
          });
        }
        data.duration = parsedDuration;
      }

      const optionalPatchFields: Record<string, unknown> = {
        albumArtist: albumArtist === undefined ? undefined : optionalString(albumArtist),
        movie: movie === undefined ? undefined : optionalString(movie),
        releaseYear: releaseYear === undefined ? undefined : optionalNumber(releaseYear),
        releaseDate: releaseDate === undefined ? undefined : parseDate(releaseDate),
        language: language === undefined ? undefined : optionalString(language),
        explicit: explicit === undefined ? undefined : optionalBoolean(explicit),
        composer: composer === undefined ? undefined : optionalString(composer),
        copyright: copyright === undefined ? undefined : optionalString(copyright),
        publisher: publisher === undefined ? undefined : optionalString(publisher),
        description: description === undefined ? undefined : optionalString(description),
        trackNumber: trackNumber === undefined ? undefined : optionalNumber(trackNumber),
        discNumber: discNumber === undefined ? undefined : optionalNumber(discNumber),
      };

      for (const [key, value] of Object.entries(optionalPatchFields)) {
        if (value !== undefined) data[key] = value;
      }

      if (thumbnailUrl !== undefined) {
        data.thumbnailUrl = optionalString(thumbnailUrl);
      }

      const taxonomyChanged = genres !== undefined || tags !== undefined;
      let finalGenres: string[] = [];
      let finalTags: string[] = [];

      if (taxonomyChanged) {
        const current = await prisma.track.findUnique({
          where: { id },
          include: {
            genres: { include: { genre: true } },
            tags: { include: { tag: true } },
          },
        });

        finalGenres = genres !== undefined
          ? parseList(genres)
          : (current?.genres || []).map((item: any) => item.genre.name);

        finalTags = tags !== undefined
          ? parseList(tags, true)
          : (current?.tags || []).map((item: any) => item.tag.name);
      }

      await prisma.$transaction(async (tx) => {
        await tx.track.update({
          where: { id },
          data,
        });

        if (artist !== undefined) {
          await syncTrackArtists(
            tx,
            id,
            String(artist).trim(),
          );
        }

        if (taxonomyChanged) {
          await syncTrackTaxonomy(
            tx,
            id,
            finalGenres,
            finalTags,
          );
        }
      });

      const finalTrack = await prisma.track.findUnique({
        where: { id },
        include: {
          musicFiles: true,
          sources: true,
          artists: {
            include: {
              artist: true,
            },
          },
          genres: { include: { genre: true } },
          tags: { include: { tag: true } },
        },
      });

      await invalidateTrackCache();
      await invalidateAllFavoritesCaches();

      return res.status(200).json({
        message: 'Track metadata updated successfully',
        track: finalTrack,
      });
    } catch (error: any) {
      console.error('Update track metadata error:', error);

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return res.status(409).json({
          error: 'DUPLICATE_TRACK',
          message: 'This song is already in your library.',
        });
      }

      return res.status(500).json({
        error:
          error?.message ||
          'Internal server error updating track details',
      });
    }
  },
);

export default router;
