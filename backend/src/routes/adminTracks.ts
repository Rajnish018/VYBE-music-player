import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';

import { prisma } from '../config/db';
import {
  authenticate,
  requireAdmin,
} from '../middleware/auth';
import { upload, adminTrackUpload } from '../middleware/upload';

import { megaService } from '../services/megaService';

import {
  normalizeTitle,
  normalizeArtist,
} from '../services/deduplicationService';

import {
  extractAudioMetadata,
} from '../services/audioMetadataService';

const router = Router();

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
  trackId: string,
  genres: string[],
  tags: string[],
) {
  const cleanGenres = parseList(genres);
  const cleanTags = parseList(tags, true);

  await prisma.trackGenre.deleteMany({ where: { trackId } });
  await prisma.trackTag.deleteMany({ where: { trackId } });

  for (const genreName of cleanGenres) {
    const normalizedName = normalizeTitle(genreName);
    if (!normalizedName) continue;
    const genre = await prisma.genre.upsert({
      where: { normalizedName },
      update: { name: genreName },
      create: { name: genreName, normalizedName },
    });
    await prisma.trackGenre.create({ data: { trackId, genreId: genre.id } });
  }

  for (const tagName of cleanTags) {
    const normalizedName = tagName.toLowerCase().trim();
    if (!normalizedName) continue;
    const tag = await prisma.tag.upsert({
      where: { normalizedName },
      update: { name: tagName },
      create: { name: tagName, normalizedName },
    });
    await prisma.trackTag.create({ data: { trackId, tagId: tag.id } });
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

async function uploadToMegaAndSave(
  localPath: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
  trackId: string,
  audioHash: string,
) {
  await megaService.connect();

  const trackFolder =
    await getMegaTrackFolder(trackId);

  const storedFileName =
    normalizedAudioFileName(fileName);

  /*
   * Upload audio.
   */
  const uploadedNode =
    await megaService.uploadFile(
      localPath,
      megaService.getNodeId(
        trackFolder,
      ),
      storedFileName,
    );

  try {
    /*
     * Save MusicFile.
     */
    const musicFile =
      await prisma.musicFile.create({
        data: {
          trackId,

          megaNodeId:
            megaService.getNodeId(
              uploadedNode,
            ),

          fileName:
            storedFileName,

          mimeType,

          fileSize,

          audioHash,
        },
      });

    return musicFile;
  } catch (error) {
    /*
     * Database failed.
     * Remove uploaded MEGA file.
     */
    try {
      await megaService.deleteFile(
        megaService.getNodeId(
          uploadedNode,
        ),
      );
    } catch (
      deleteError
    ) {
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

      /*
       * 6. Atomically reserve the Track.
       *
       * The database @@unique([normalizedTitle, normalizedArtist])
       * is the final protection against simultaneous uploads.
       */
      let track;

      try {
        track = await prisma.track.create({
          data: {
            title: String(finalTitle).trim(),
            normalizedTitle: normTitle,
            artist: String(finalArtist).trim(),
            normalizedArtist: normArtist,
            album:
              String(finalAlbum || '').trim() ||
              null,
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
            duration: Math.round(
              Number(finalDuration),
            ),
            thumbnailUrl: null,
            coverMimeType: metadata.coverMimeType || null,
            coverWidth: getMetadataNumber(richMetadata, 'coverWidth', 'width'),
            coverHeight: getMetadataNumber(richMetadata, 'coverHeight', 'height'),
          },
        });
      } catch (error: any) {
        if (
          error instanceof
            Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const conflictingTrack =
            await prisma.track.findFirst({
              where: {
                normalizedTitle: normTitle,
                normalizedArtist: normArtist,
              },
              select: {
                id: true,
                title: true,
                artist: true,
                album: true,
                thumbnailUrl: true,
              },
            });

          if (conflictingTrack) {
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
                  conflictingTrack,
                ),
              );
          }
        }

        throw error;
      }

      createdTrackId = track.id;

      /*
       * 7. ONLY after duplicate protection has passed,
       *    create the MEGA folder and upload audio.
       */
      const musicFile =
        await uploadToMegaAndSave(
          tempFilePath,
          file.originalname,
          file.size,
          file.mimetype,
          track.id,
          audioHash,
        );

      uploadedAudioNodeId =
        musicFile.megaNodeId;

      // Save codec/container-specific metadata on MusicFile.
      const technicalMetadata = {
        codec: optionalString(getMetadataValue(richMetadata, 'codec', 'codecName', 'format')),
        bitrate: getMetadataNumber(richMetadata, 'bitrate', 'bitRate'),
        sampleRate: getMetadataNumber(richMetadata, 'sampleRate', 'sample_rate'),
        bitsPerSample: getMetadataNumber(richMetadata, 'bitsPerSample', 'bitDepth', 'bitsPerSample'),
        channels: getMetadataNumber(richMetadata, 'channels', 'channelCount'),
      };

      const savedMusicFile =
        await prisma.musicFile.update({
          where: { id: musicFile.id },
          data: technicalMetadata,
        });

      // Keep the response object in sync with the database row.
      Object.assign(musicFile, savedMusicFile);

      await syncTrackTaxonomy(track.id, genres, tags);

      // 8. Find the MEGA track folder.
      const trackFolder =
        await getMegaTrackFolder(
          track.id,
        );

      const trackFolderId =
        megaService.getNodeId(
          trackFolder,
        );

      // 9. Upload artwork.
      // Priority: manually selected cover > embedded cover.
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

      if (coverBuffer && coverMimeType && coverExtension) {
        const coverFileName = `cover${coverExtension}`;

        console.log(`[ARTWORK] Uploading ${coverFileName}...`);

        const uploadedCover =
          await megaService.uploadCoverFile(
            coverBuffer,
            coverFileName,
            coverMimeType,
            trackFolderId,
          );

        uploadedCoverNodeId =
          megaService.getNodeId(uploadedCover);

        console.log(
          `[ARTWORK] Cover uploaded successfully: ${uploadedCoverNodeId}`,
        );

        thumbnailUrl = `/api/tracks/${track.id}/cover`;

        await prisma.track.update({
          where: { id: track.id },
          data: {
            thumbnailUrl,
          },
        });

        console.log(
          `[ARTWORK] Database thumbnailUrl: ${thumbnailUrl}`,
        );
      } else {
        console.log('[ARTWORK] No artwork found.');
      }

      // Delete temporary custom cover upload.
      if (customCover?.path && fs.existsSync(customCover.path)) {
        try {
          fs.unlinkSync(customCover.path);
        } catch {}
      }

      // 10. Delete temporary local upload.
      if (
        tempFilePath &&
        fs.existsSync(tempFilePath)
      ) {
        fs.unlinkSync(tempFilePath);
        tempFilePath = null;
      }

      // 11. Return final database object.
      const finalTrack =
        await prisma.track.findUnique({
          where: {
            id: track.id,
          },
        });

      return res
        .status(201)
        .json({
          message: thumbnailUrl
            ? 'Track, audio and cover uploaded successfully.'
            : 'Track and audio uploaded successfully. No embedded cover art was found.',
          track: finalTrack,
          musicFile,
          artwork: {
            uploaded: Boolean(
              thumbnailUrl,
            ),
            url: thumbnailUrl,
          },
        });
    } catch (error: any) {
      console.error(
        'Track creation/upload error:',
        error,
      );

      /*
       * Handle any unique constraint that reaches the outer catch.
       */
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicateTrack =
          await prisma.track.findFirst({
            where: {
              normalizedTitle:
                normalizeTitle(
                  String(req.body.title || ''),
                ),
              normalizedArtist:
                normalizeArtist(
                  String(req.body.artist || ''),
                ),
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
      }

      // Remove uploaded cover from MEGA.
      if (uploadedCoverNodeId) {
        try {
          await megaService.deleteFile(
            uploadedCoverNodeId,
          );
        } catch (deleteError) {
          console.warn(
            'Could not remove uploaded cover after failure:',
            deleteError,
          );
        }
      }

      // Remove uploaded audio from MEGA.
      if (uploadedAudioNodeId) {
        try {
          await megaService.deleteFile(
            uploadedAudioNodeId,
          );
        } catch (deleteError) {
          console.warn(
            'Could not remove uploaded audio after failure:',
            deleteError,
          );
        }
      }

      // Remove temporary custom cover upload.
      if (customCover?.path && fs.existsSync(customCover.path)) {
        try {
          fs.unlinkSync(customCover.path);
        } catch {}
      }

      // Remove temporary local upload.
      if (
        tempFilePath &&
        fs.existsSync(tempFilePath)
      ) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch {}
      }

      // MusicFile is removed by Track's onDelete: Cascade.
      if (createdTrackId) {
        try {
          await prisma.track.delete({
            where: {
              id: createdTrackId,
            },
          });
        } catch (deleteError) {
          console.warn(
            'Could not remove track after failed upload:',
            deleteError,
          );
        }
      }

      return res
        .status(500)
        .json({
          error:
            error?.message ||
            'Internal server error uploading track.',
        });
    }
  },
);

/*
 * |--------------------------------------------------------------------------
 * | POST /api/admin/tracks/:id/audio
 * |
 * | Replace audio + optionally replace embedded cover
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
    let tempFilePath:
      | string
      | null = null;

    let uploadedAudioNodeId:
      | string
      | null = null;

    let uploadedCoverNodeId:
      | string
      | null = null;

    try {
      const { id } =
        req.params;

      const file =
        req.file;

      if (!file) {
        return res
          .status(400)
          .json({
            error:
              'Audio file is required',
          });
      }

      tempFilePath =
        file.path;

      const track =
        await prisma.track.findUnique({
          where: {
            id,
          },
        });

      if (!track) {
        fs.unlinkSync(
          tempFilePath,
        );

        tempFilePath =
          null;

        return res
          .status(404)
          .json({
            error:
              'Track not found',
          });
      }

      /*
       * Extract metadata + artwork.
       */
      const metadata =
        await extractAudioMetadata(
          file.path,
          file.originalname,
        );

      const richMetadata: any = metadata as any;

      const albumArtist =
        optionalString(req.body.albumArtist) ||
        optionalString(getMetadataValue(richMetadata, 'albumArtist', 'album_artist'));

      const movie =
        optionalString(req.body.movie) ||
        optionalString(getMetadataValue(richMetadata, 'movie', 'film', 'show'));

      const releaseYear =
        req.body.releaseYear !== undefined
          ? optionalNumber(req.body.releaseYear)
          : getMetadataNumber(richMetadata, 'releaseYear', 'year');

      const releaseDate =
        req.body.releaseDate !== undefined
          ? parseDate(req.body.releaseDate)
          : parseDate(getMetadataValue(richMetadata, 'releaseDate', 'date'));

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
        req.body.trackNumber !== undefined
          ? optionalNumber(req.body.trackNumber)
          : getMetadataNumber(richMetadata, 'trackNumber', 'track');

      const discNumber =
        req.body.discNumber !== undefined
          ? optionalNumber(req.body.discNumber)
          : getMetadataNumber(richMetadata, 'discNumber', 'disc');

      const genres = parseList(
        req.body.genres ??
          req.body.genre ??
          getMetadataValue(richMetadata, 'genres', 'genre'),
      );

      const tags = parseList(
        req.body.tags ??
          req.body.tag ??
          getMetadataValue(richMetadata, 'tags', 'tag'),
      );

      console.log(
        '[AUDIO METADATA]',
        {
          title:
            metadata.title,

          artist:
            metadata.artist,

          album:
            metadata.album,

          duration:
            metadata.duration,

          hasCover:
            Boolean(
              metadata.coverBuffer,
            ),

          coverSize:
            metadata.coverBuffer
              ?.length || 0,

          coverMimeType:
            metadata.coverMimeType,

          coverExtension:
            metadata.coverExtension,

          pictureCount:
            metadata.pictureCount,

          selectedPictureType:
            metadata.selectedPictureType,
        },
      );

      /*
       * Calculate the new file hash BEFORE deleting the existing audio.
       * This prevents a replacement upload from destroying the current
       * file when the same audio already exists on another track.
       */
      const audioHash =
        await computeFileHash(tempFilePath);

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
          fs.unlinkSync(tempFilePath);
          tempFilePath = null;
        }

        return res
          .status(409)
          .json(
            getDuplicateResponse(
              duplicateFile.track,
            ),
          );
      }

      /*
       * Find existing audio.
       */
      const existingFile =
        await prisma.musicFile.findFirst({
          where: {
            trackId:
              id,
          },
        });

      /*
       * Delete old audio only after duplicate protection passes.
       */
      if (existingFile) {
        try {
          await megaService.deleteFile(
            existingFile.megaNodeId,
          );
        } catch (
          error
        ) {
          console.warn(
            'Could not delete old file from MEGA:',
            error,
          );
        }

        await prisma.musicFile.delete({
          where: {
            id:
              existingFile.id,
          },
        });
      }

      /*
       * Upload replacement audio.
       */
      const musicFile =
        await uploadToMegaAndSave(
          tempFilePath,
          file.originalname,
          file.size,
          file.mimetype,
          track.id,
          audioHash,
        );

      uploadedAudioNodeId =
        musicFile.megaNodeId;

      const updatedMusicFile =
        await prisma.musicFile.update({
          where: { id: musicFile.id },
          data: {
            codec: optionalString(
              getMetadataValue(
                richMetadata,
                'codec',
                'codecName',
                'format',
              ),
            ),
            bitrate: getMetadataNumber(
              richMetadata,
              'bitrate',
              'bitRate',
            ),
            sampleRate: getMetadataNumber(
              richMetadata,
              'sampleRate',
              'sample_rate',
            ),
            bitsPerSample: getMetadataNumber(
              richMetadata,
              'bitsPerSample',
              'bitDepth',
            ),
            channels: getMetadataNumber(
              richMetadata,
              'channels',
              'channelCount',
            ),
          },
        });

      Object.assign(musicFile, updatedMusicFile);

      /*
       * Get track folder.
       */
      const trackFolder =
        await getMegaTrackFolder(
          track.id,
        );

      const trackFolderId =
        megaService.getNodeId(
          trackFolder,
        );

      /*
       * Preserve existing thumbnail
       * if replacement audio has no cover.
       */
      let thumbnailUrl =
        track.thumbnailUrl;

      /*
       * If new audio contains artwork,
       * replace old cover.
       */
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

        /*
         * Remove existing cover first.
         */
        await deleteMegaCoverFiles(
          trackFolder,
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

        thumbnailUrl =
          `/api/tracks/${track.id}/cover`;

        console.log(
          `[ARTWORK] New cover uploaded: ${uploadedCoverNodeId}`,
        );
      }

      /*
       * Update track.
       */
      const updatedTrack =
        await prisma.track.update({
          where: {
            id:
              track.id,
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
            coverMimeType: metadata.coverMimeType || track.coverMimeType,
            coverWidth: getMetadataNumber(richMetadata, 'coverWidth', 'width') ?? track.coverWidth,
            coverHeight: getMetadataNumber(richMetadata, 'coverHeight', 'height') ?? track.coverHeight,
            thumbnailUrl,
          },
        });

      /*
       * Remove temporary file.
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

      return res
        .status(200)
        .json({
          message:
            'Audio file uploaded/replaced successfully',

          track:
            updatedTrack,

          musicFile,

          artwork: {
            uploaded:
              Boolean(
                uploadedCoverNodeId,
              ),

            url:
              thumbnailUrl,
          },
        });
    } catch (
      error: any
    ) {
      console.error(
        'Audio upload error:',
        error,
      );

      /*
       * Remove newly uploaded cover.
       */
      if (
        uploadedCoverNodeId
      ) {
        try {
          await megaService.deleteFile(
            uploadedCoverNodeId,
          );
        } catch (
          deleteError
        ) {
          console.warn(
            'Could not remove uploaded cover:',
            deleteError,
          );
        }
      }

      /*
       * Remove newly uploaded audio.
       */
      if (
        uploadedAudioNodeId
      ) {
        try {
          await megaService.deleteFile(
            uploadedAudioNodeId,
          );
        } catch (
          deleteError
        ) {
          console.warn(
            'Could not remove uploaded audio:',
            deleteError,
          );
        }
      }

      /*
       * Remove temporary file.
       */
      if (
        tempFilePath &&
        fs.existsSync(
          tempFilePath,
        )
      ) {
        try {
          fs.unlinkSync(
            tempFilePath,
          );
        } catch {}
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
    try {
      const { id } =
        req.params;

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
       * Delete audio from MEGA.
       */
      try {
        await megaService.deleteFile(
          existingFile.megaNodeId,
        );
      } catch (
        error
      ) {
        console.warn(
          'Could not delete file from MEGA:',
          error,
        );
      }

      /*
       * Delete DB record.
       */
      await prisma.musicFile.delete({
        where: {
          id:
            existingFile.id,
        },
      });

      return res
        .status(200)
        .json({
          message:
            'Audio file deleted successfully',
        });
    } catch (
      error
    ) {
      console.error(
        'Delete audio error:',
        error,
      );

      return res
        .status(500)
        .json({
          error:
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
          try { fs.unlinkSync(file.path); } catch {}
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
        try { fs.unlinkSync(req.file.path); } catch {}
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
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const track = await prisma.track.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }

      await megaService.connect();
      const trackFolder = await findMegaTrackFolder(id);
      let deleted = false;

      if (trackFolder) {
        const coverFiles = (trackFolder.children || []).filter(isCoverFile);
        for (const coverFile of coverFiles) {
          try {
            await megaService.deleteFile(megaService.getNodeId(coverFile));
            deleted = true;
          } catch (error) {
            console.warn(
              `[ARTWORK] Could not delete cover '${coverFile.name}':`,
              error,
            );
          }
        }
      }

      const updatedTrack = await prisma.track.update({
        where: { id },
        data: {
          thumbnailUrl: null,
          coverMimeType: null,
          coverWidth: null,
          coverHeight: null,
        },
      });

      return res.status(200).json({
        message: deleted
          ? 'Cover deleted successfully.'
          : 'Cover reference cleared. No cover file was found.',
        track: updatedTrack,
        artwork: { uploaded: false, url: null },
      });
    } catch (error: any) {
      console.error('Delete cover error:', error);
      return res.status(500).json({
        error: error?.message || 'Internal server error deleting cover',
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
    try {
      const { id } =
        req.params;

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
            error:
              'Track not found',
          });
      }

      await megaService.connect();

      const trackFolder =
        await findMegaTrackFolder(id);

      for (const musicFile of track.musicFiles) {
        try {
          await megaService.deleteFile(
            musicFile.megaNodeId,
          );
        } catch (error) {
          console.warn(
            '[MEGA] Could not delete track audio:',
            error,
          );
        }
      }

      if (trackFolder) {
        await deleteMegaCoverFiles(
          trackFolder,
        );
      }

      await prisma.track.delete({
        where: {
          id,
        },
      });

      return res
        .status(200)
        .json({
          message:
            'Track deleted successfully',
        });
    } catch (error) {
      console.error(
        'Delete track error:',
        error,
      );

      return res
        .status(500)
        .json({
          error:
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

      await prisma.track.update({ where: { id }, data });

      if (taxonomyChanged) {
        await syncTrackTaxonomy(id, finalGenres, finalTags);
      }

      const finalTrack = await prisma.track.findUnique({
        where: { id },
        include: {
          musicFiles: true,
          sources: true,
          genres: { include: { genre: true } },
          tags: { include: { tag: true } },
        },
      });

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
