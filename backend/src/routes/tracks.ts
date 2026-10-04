import {
  Router,
  Request,
  Response,
} from 'express';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { prisma } from '../config/db';

import { authenticate } from '../middleware/auth';

import { megaService } from '../services/megaService';

import {
  redisKeys,
  redisService,
  redisTtl,
} from '../services/redisService';

import {
  youtubeService,
} from '../services/youtubeService';

const router =
  Router();


  const execFileAsync =
  promisify(execFile);

/* ============================================================
 * YouTube import helpers
 * ============================================================ */

function normalizeTitle(
  value: string,
): string {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeArtist(
  value: string,
): string {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\s,&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function downloadYouTubeAudio(
  youtubeId: string,
  outputPath: string,
): Promise<string> {
  const youtubeUrl =
    `https://www.youtube.com/watch?v=${youtubeId}`;

  const outputTemplate =
    outputPath.replace(
      /\.mp3$/i,
      '.%(ext)s',
    );

  await execFileAsync(
    'yt-dlp',
    [
      '--js-runtimes',
      'node',

      '--no-playlist',

      '--no-warnings',

      '--extract-audio',

      '--audio-format',
      'mp3',

      '--audio-quality',
      '0',

      '--output',
      outputTemplate,

      youtubeUrl,
    ],
    {
      maxBuffer:
        10 * 1024 * 1024,
    },
  );

  if (
    !fs.existsSync(outputPath)
  ) {
    throw new Error(
      'yt-dlp completed but the MP3 file was not created.',
    );
  }

  return outputPath;
}

async function sha256File(
  filePath: string,
): Promise<string> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const hash =
        crypto.createHash(
          'sha256',
        );

      const stream =
        fs.createReadStream(
          filePath,
        );

      stream.on(
        'error',
        reject,
      );

      stream.on(
        'data',
        (chunk) => {
          hash.update(chunk);
        },
      );

      stream.on(
        'end',
        () => {
          resolve(
            hash.digest('hex'),
          );
        },
      );
    },
  );
}

function getSafeTrackTitle(
  title: string,
): string {
  return title
    .replace(
      /[\\/:*?"<>|]/g,
      ' ',
    )
    .replace(
      /\s+/g,
      ' ',
    )
    .trim()
    .slice(
      0,
      180,
    ) ||
    'YouTube Track';
}

/*
 * ============================================================
 * GET /api/tracks
 * ============================================================
 */
router.get(
  '/',
  authenticate,
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const cachedTracks =
        await redisService.getJson<any[]>(
          redisKeys.tracksAll,
        );

      if (cachedTracks) {
        return res
          .status(200)
          .json(cachedTracks);
      }

      const tracks =
        await prisma.track.findMany({
          where: {
            musicFiles: {
              some: {},
            },
          },

          orderBy: {
            title: 'asc',
          },
        });

      await redisService.setJson(
        redisKeys.tracksAll,
        tracks,
        redisTtl.tracks,
      );

      return res
        .status(200)
        .json(tracks);
    } catch (error) {
      console.error(
        'Fetch tracks error:',
        error,
      );

      return res
        .status(500)
        .json({
          error:
            'Internal server error fetching tracks',
        });
    }
  },
);

/*
 * ============================================================
 * GET /api/tracks/library
 * ============================================================
 *
 * Returns ONLY tracks explicitly saved by the authenticated user.
 *
 * Global Track/MusicFile records remain shared.
 * UserTrack determines whether the current user has saved the track.
 * ============================================================
 */
router.get(
  '/library',
  authenticate,
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const userId = req.user!.id;

      const userTracks =
        await prisma.userTrack.findMany({
          where: {
            userId,
            track: {
              musicFiles: {
                some: {},
              },
            },
          },

          include: {
            track: {
              include: {
                musicFiles: true,
                sources: true,
                artists: {
                  include: {
                    artist: true,
                  },
                },
              },
            },
          },

          orderBy: {
            createdAt: 'desc',
          },
        });

      /*
       * Return Track objects directly so the existing frontend
       * Library can consume the response without needing to know
       * about the UserTrack junction table.
       */
      const tracks =
        userTracks.map(
          (userTrack) => userTrack.track,
        );

      return res
        .status(200)
        .json(tracks);
    } catch (error) {
      console.error(
        'Fetch user library error:',
        error,
      );

      return res
        .status(500)
        .json({
          error:
            'Internal server error fetching your library',
        });
    }
  },
);

/*
 * ============================================================
 * GET /api/tracks/search
 * ============================================================
 *
 * Library:
 *   GET /api/tracks/search?q=...
 *
 * YouTube:
 *   GET /api/tracks/search?q=...&source=youtube
 *
 * YouTube search is now completely API-key free.
 *
 * It uses youtubeService.searchVideos(), which internally
 * uses the keyless YouTube discovery implementation.
 * ============================================================
 */
router.get(
  '/search',
  authenticate,
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const query =
        req.query.q as string;

      if (!query) {
        return res
          .status(200)
          .json([]);
      }

      const cleanQuery =
        query
          .trim()
          .toLowerCase();

      /*
       * ========================================================
       * YouTube search
       * ========================================================
       *
       * IMPORTANT:
       *
       * There is intentionally NO:
       *
       * process.env.YOUTUBE_API_KEY
       *
       * check here.
       *
       * youtubeService.searchVideos() is responsible for
       * performing the keyless YouTube search.
       */
      if (
        req.query.source ===
        'youtube'
      ) {
        try {
          const results =
            await youtubeService.searchVideos(
              query,
            );

          return res
            .status(200)
            .json(results);
        } catch (error) {
          console.error(
            'YouTube search error:',
            error,
          );

          return res
            .status(502)
            .json({
              error:
                error instanceof Error
                  ? error.message
                  : 'YouTube search failed',
            });
        }
      }

      /*
       * ========================================================
       * Library search
       * ========================================================
       */
      const tracks =
        await prisma.track.findMany({
          where: {
            musicFiles: {
              some: {},
            },

            OR: [
              {
                normalizedTitle: {
                  contains:
                    cleanQuery,
                },
              },

              {
                normalizedArtist: {
                  contains:
                    cleanQuery,
                },
              },

              {
                title: {
                  contains:
                    query,

                  mode: 'insensitive',
                },
              },

              {
                artist: {
                  contains:
                    query,

                  mode: 'insensitive',
                },
              },
            ],
          },

          take: 20,
        });

      return res
        .status(200)
        .json(tracks);
    } catch (error) {
      console.error(
        'Search tracks error:',
        error,
      );

      return res
        .status(500)
        .json({
          error:
            'Internal server error searching tracks',
        });
    }
  },
);


/* ============================================================
 * POST /api/tracks/youtube/save
 *
 * YouTube:
 *
 * youtubeId
 *     ↓
 * YouTube metadata
 *     ↓
 * yt-dlp
 *     ↓
 * MP3
 *     ↓
 * SHA-256
 *     ↓
 * duplicate check
 *     ↓
 * MEGA
 *     ↓
 * MusicFile
 *     ↓
 * TrackSource
 *     ↓
 * Artist / TrackArtist
 *     ↓
 * UserTrack
 * ============================================================ */

router.post(
  '/youtube/save',
  authenticate,
  async (
    req: Request,
    res: Response,
  ) => {
    let tempAudioPath:
      string | null = null;

    let uploadedAudioNodeId:
      string | null = null;

    let createdTrackId:
      string | null = null;

    let createdTrack =
      false;

    try {
      const userId =
        req.user!.id;

      const youtubeId =
        String(
          req.body?.youtubeId ||
            '',
        ).trim();

      /* ======================================================
       * 1. Validate YouTube ID
       * ====================================================== */

      if (!youtubeId) {
        return res
          .status(400)
          .json({
            error:
              'YouTube video ID is required',
          });
      }

      if (
        !/^[A-Za-z0-9_-]{11}$/.test(
          youtubeId,
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'Invalid YouTube video ID',
          });
      }

      /* ======================================================
       * 2. Check existing YouTube source
       * ====================================================== */

      const existingSource =
        await prisma.trackSource.findUnique(
          {
            where: {
              provider_sourceId: {
                provider:
                  'youtube',

                sourceId:
                  youtubeId,
              },
            },

            include: {
              track: {
                include: {
                  musicFiles: true,

                  sources: true,

                  artists: {
                    include: {
                      artist: true,
                    },
                  },
                },
              },
            },
          },
        );

      /*
       * Already imported completely.
       *
       * Do not download again.
       */
      if (
        existingSource?.track
          ?.musicFiles
          ?.length
      ) {
        const track =
          existingSource.track;

        const userTrack =
          await prisma.userTrack.upsert(
            {
              where: {
                userId_trackId: {
                  userId,

                  trackId:
                    track.id,
                },
              },

              create: {
                userId,

                trackId:
                  track.id,
              },

              update: {},
            },
          );

        return res
          .status(200)
          .json({
            message:
              'Track saved to your library',

            saved: true,

            existing: true,

            youtubeId,

            userTrack,

            track,
          });
      }

      /* ======================================================
       * 3. Get YouTube metadata
       * ====================================================== */

      const metadata =
        await youtubeService.getVideoMetadata(
          youtubeId,
        );

      if (!metadata) {
        return res
          .status(404)
          .json({
            error:
              'Unable to retrieve YouTube video metadata',
          });
      }

      const title =
        String(
          metadata.title ||
            '',
        ).trim() ||
        'Untitled YouTube Track';

      const artist =
        String(
          metadata.channelTitle ||
            '',
        ).trim() ||
        'Unknown Artist';

      const normalizedTitle =
        normalizeTitle(
          title,
        );

      const normalizedArtist =
        normalizeArtist(
          artist,
        );

      if (
        !normalizedTitle ||
        !normalizedArtist
      ) {
        return res
          .status(422)
          .json({
            error:
              'YouTube metadata does not contain a usable title and artist.',
          });
      }

      const duration =
        Math.max(
          0,
          Math.round(
            Number(
              metadata.duration,
            ) || 0,
          ),
        );

      const sourceUrl =
        `https://www.youtube.com/watch?v=${youtubeId}`;

      /* ======================================================
       * 4. Create temporary directory
       * ====================================================== */

      const tempDir =
        path.join(
          process.cwd(),
          'tmp',
          'youtube-imports',
        );

      fs.mkdirSync(
        tempDir,
        {
          recursive: true,
        },
      );

      const tempBase =
        `youtube-${youtubeId}-${Date.now()}`;

      tempAudioPath =
        path.join(
          tempDir,
          `${tempBase}.mp3`,
        );

      /* ======================================================
       * 5. Download YouTube audio
       * ====================================================== */

      console.log(
        `[YouTube Import] Downloading ${youtubeId}`,
      );

      await downloadYouTubeAudio(
        youtubeId,
        tempAudioPath,
      );

      const fileStats =
        fs.statSync(
          tempAudioPath,
        );

      console.log(
        `[YouTube Import] Downloaded ${fileStats.size} bytes`,
      );

      /* ======================================================
       * 6. Calculate SHA-256
       * ====================================================== */

      const audioHash =
        await sha256File(
          tempAudioPath,
        );

      console.log(
        `[YouTube Import] SHA-256: ${audioHash}`,
      );

      /* ======================================================
       * 7. Audio-level duplicate check
       * ====================================================== */

      const existingMusicFile =
        await prisma.musicFile.findUnique(
          {
            where: {
              audioHash,
            },

            include: {
              track: {
                include: {
                  musicFiles: true,

                  sources: true,

                  artists: {
                    include: {
                      artist: true,
                    },
                  },
                },
              },
            },
          },
        );

      if (existingMusicFile) {
        const track =
          existingMusicFile.track;

        console.log(
          `[YouTube Import] Audio duplicate found: ${track.id}`,
        );

        await prisma.trackSource.upsert(
          {
            where: {
              provider_sourceId: {
                provider:
                  'youtube',

                sourceId:
                  youtubeId,
              },
            },

            create: {
              trackId:
                track.id,

              provider:
                'youtube',

              sourceId:
                youtubeId,

              sourceUrl,
            },

            update: {
              trackId:
                track.id,

              sourceUrl,
            },
          },
        );

        const userTrack =
          await prisma.userTrack.upsert(
            {
              where: {
                userId_trackId: {
                  userId,

                  trackId:
                    track.id,
                },
              },

              create: {
                userId,

                trackId:
                  track.id,
              },

              update: {},
            },
          );

        return res
          .status(200)
          .json({
            message:
              'Matching audio already exists and was saved to your library',

            saved: true,

            existing: true,

            deduplicated:
              true,

            youtubeId,

            userTrack,

            track,
          });
      }

      /* ======================================================
       * 8. Metadata duplicate check
       * ====================================================== */

      const existingTrack =
        await prisma.track.findUnique(
          {
            where: {
              normalizedTitle_normalizedArtist:
                {
                  normalizedTitle,

                  normalizedArtist,
                },
            },

            include: {
              musicFiles: true,

              sources: true,

              artists: {
                include: {
                  artist: true,
                },
              },
            },
          },
        );

      /*
       * Same title + artist and already playable.
       */
      if (
        existingTrack?.musicFiles
          ?.length
      ) {
        const track =
          existingTrack;

        console.log(
          `[YouTube Import] Metadata duplicate found: ${track.id}`,
        );

        await prisma.trackSource.upsert(
          {
            where: {
              provider_sourceId: {
                provider:
                  'youtube',

                sourceId:
                  youtubeId,
              },
            },

            create: {
              trackId:
                track.id,

              provider:
                'youtube',

              sourceId:
                youtubeId,

              sourceUrl,
            },

            update: {
              trackId:
                track.id,

              sourceUrl,
            },
          },
        );

        const userTrack =
          await prisma.userTrack.upsert(
            {
              where: {
                userId_trackId: {
                  userId,

                  trackId:
                    track.id,
                },
              },

              create: {
                userId,

                trackId:
                  track.id,
              },

              update: {},
            },
          );

        return res
          .status(200)
          .json({
            message:
              'Matching track already exists and was saved to your library',

            saved: true,

            existing: true,

            deduplicated:
              true,

            youtubeId,

            userTrack,

            track,
          });
      }

      /* ======================================================
       * 9. Create Track
       * ====================================================== */

      /*
       * Generate the Prisma Track ID ourselves.
       *
       * This lets us create:
       *
       * Music/
       *   track_<trackId>/
       *
       * in MEGA before the MusicFile row exists.
       */

      const trackId =
        existingTrack?.id ||
        crypto.randomUUID();

      createdTrackId =
        trackId;

      createdTrack =
        !existingTrack;

      if (!existingTrack) {
        await prisma.track.create(
          {
            data: {
              id:
                trackId,

              title,

              normalizedTitle,

              artist,

              normalizedArtist,

              album:
                'YouTube',

              duration,

              thumbnailUrl:
                metadata.thumbnailUrl ||
                null,
            },
          },
        );
      }

      /* ======================================================
       * 10. Connect MEGA
       * ====================================================== */

      await megaService.connect();

      /* ======================================================
       * 11. Get/Create Music folder
       * ====================================================== */

      const musicFolder =
        await megaService.getOrCreateFolder(
          'Music',
        );

      /* ======================================================
       * 12. Get/Create Track folder
       * ====================================================== */

      const trackFolder =
        await megaService.getOrCreateFolder(
          `track_${trackId}`,

          musicFolder,
        );

      /* ======================================================
       * 13. Upload MP3 to MEGA
       * ====================================================== */

      const fileName =
        `${getSafeTrackTitle(title)}.mp3`;

      console.log(
        `[YouTube Import] Uploading ${fileName} to MEGA`,
      );

      const uploadedAudio =
        await megaService.uploadFile(
          tempAudioPath,

          megaService.getNodeId(
            trackFolder,
          ),

          fileName,
        );

      uploadedAudioNodeId =
        megaService.getNodeId(
          uploadedAudio,
        );

      console.log(
        `[YouTube Import] MEGA node: ${uploadedAudioNodeId}`,
      );

      /* ======================================================
       * 14. Create MusicFile
       * ====================================================== */

      const musicFile =
        await prisma.musicFile.create(
          {
            data: {
              trackId,

              megaFileId:
                uploadedAudioNodeId,

              megaNodeId:
                uploadedAudioNodeId,

              fileName,

              fileSize:
                Number(
                  fileStats.size,
                ),

              mimeType:
                'audio/mpeg',

              audioHash,
            },
          },
        );

      /* ======================================================
       * 15. Create/Update TrackSource
       * ====================================================== */

      await prisma.trackSource.upsert(
        {
          where: {
            provider_sourceId: {
              provider:
                'youtube',

              sourceId:
                youtubeId,
            },
          },

          create: {
            trackId,

            provider:
              'youtube',

            sourceId:
              youtubeId,

            sourceUrl,
          },

          update: {
            trackId,

            sourceUrl,
          },
        },
      );

      /* ======================================================
       * 16. Create/Find Artist
       * ====================================================== */

      const artistRecord =
        await prisma.artist.upsert(
          {
            where: {
              normalizedName:
                normalizedArtist,
            },

            create: {
              name:
                artist,

              normalizedName:
                normalizedArtist,
            },

            update: {},
          },
        );

      /* ======================================================
       * 17. Connect Track -> Artist
       * ====================================================== */

      await prisma.trackArtist.upsert(
        {
          where: {
            trackId_artistId: {
              trackId,

              artistId:
                artistRecord.id,
            },
          },

          create: {
            trackId,

            artistId:
              artistRecord.id,
          },

          update: {},
        },
      );

      /* ======================================================
       * 18. Save to current user's Library
       * ====================================================== */

      const userTrack =
        await prisma.userTrack.upsert(
          {
            where: {
              userId_trackId: {
                userId,

                trackId,
              },
            },

            create: {
              userId,

              trackId,
            },

            update: {},
          },
        );

      /* ======================================================
       * 19. Return complete Track
       * ====================================================== */

      const track =
        await prisma.track.findUnique(
          {
            where: {
              id:
                trackId,
            },

            include: {
              musicFiles: true,

              sources: true,

              artists: {
                include: {
                  artist: true,
                },
              },
            },
          },
        );

      console.log(
        `[YouTube Import] Successfully imported ${youtubeId} as Track ${trackId}`,
      );

      return res
        .status(201)
        .json({
          message:
            'YouTube track downloaded and saved to your library',

          saved: true,

          existing: false,

          deduplicated:
            false,

          youtubeId,

          userTrack,

          musicFile,

          track,
        });
    } catch (error) {
      console.error(
        'YouTube save/import error:',
        error,
      );

      /* ======================================================
       * Cleanup MEGA upload
       * ====================================================== */

      if (
        uploadedAudioNodeId
      ) {
        try {
          await megaService.deleteFile(
            uploadedAudioNodeId,
          );
        } catch (
          cleanupError
        ) {
          console.error(
            'Failed to clean up uploaded YouTube audio:',
            cleanupError,
          );
        }
      }

      /* ======================================================
       * Cleanup newly-created Track
       * ====================================================== */

      if (
        createdTrack &&
        createdTrackId
      ) {
        try {
          await prisma.track.delete(
            {
              where: {
                id:
                  createdTrackId,
              },
            },
          );
        } catch (
          cleanupError
        ) {
          console.error(
            'Failed to clean up partially created Track:',
            cleanupError,
          );
        }
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Failed to save YouTube track';

      return res
        .status(500)
        .json({
          error:
            message,
        });
    } finally {
      /* ======================================================
       * Always delete local temporary MP3
       * ====================================================== */

      if (
        tempAudioPath &&
        fs.existsSync(
          tempAudioPath,
        )
      ) {
        try {
          fs.unlinkSync(
            tempAudioPath,
          );
        } catch (
          cleanupError
        ) {
          console.warn(
            'Failed to remove temporary YouTube audio:',
            cleanupError,
          );
        }
      }
    }
  },
);
/*
 * ============================================================
 * GET /api/tracks/:id/cover
 *
 * Streams cover artwork from MEGA.
 * ============================================================
 */
router.get(
  '/:id/cover',
  authenticate,
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

          select: {
            id: true,
            thumbnailUrl: true,
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

      const musicFolder =
        await megaService.getFolder(
          'Music',
        );

      if (!musicFolder) {
        return res
          .status(404)
          .json({
            error:
              'Track artwork not found',
          });
      }

      const trackFolder =
        await megaService.getFolder(
          `track_${track.id}`,
          musicFolder,
        );

      if (!trackFolder) {
        return res
          .status(404)
          .json({
            error:
              'Track artwork not found',
          });
      }

      const children =
        trackFolder.children ||
        [];

      const coverFile =
        children.find(
          (child: any) => {
            if (
              child.directory
            ) {
              return false;
            }

            const name =
              String(
                child.name ||
                  '',
              ).toLowerCase();

            return (
              name ===
                'cover.jpg' ||
              name ===
                'cover.jpeg' ||
              name ===
                'cover.png' ||
              name ===
                'cover.webp' ||
              name ===
                'cover.gif'
            );
          },
        );

      if (!coverFile) {
        return res
          .status(404)
          .json({
            error:
              'Track artwork not found',
          });
      }

      const mimeType =
        megaService.getMimeType(
          coverFile.name,
        );

      res.setHeader(
        'Content-Type',
        mimeType,
      );

      if (
        coverFile.size
      ) {
        res.setHeader(
          'Content-Length',
          String(
            coverFile.size,
          ),
        );
      }

      /*
       * Browser/private cache.
       */
      res.setHeader(
        'Cache-Control',
        'private, max-age=3600',
      );

      console.log(
        `[COVER] Streaming '${coverFile.name}' for track ${id}`,
      );

      const stream =
        coverFile.download();

      stream.on(
        'error',
        (
          error: any,
        ) => {
          console.error(
            '[COVER] MEGA stream error:',
            error,
          );

          if (
            !res.headersSent
          ) {
            res
              .status(500)
              .end();
          } else {
            res.destroy();
          }
        },
      );

      stream.pipe(res);
    } catch (error) {
      console.error(
        'Track cover error:',
        error,
      );

      if (
        !res.headersSent
      ) {
        return res
          .status(500)
          .json({
            error:
              'Internal server error loading artwork',
          });
      }
    }
  },
);

/*
 * ============================================================
 * GET /api/tracks/:id
 * ============================================================
 */
router.get(
  '/:id',
  authenticate,
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
            sources: true,
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

      return res
        .status(200)
        .json(track);
    } catch (error) {
      console.error(
        'Fetch track by id error:',
        error,
      );

      return res
        .status(500)
        .json({
          error:
            'Internal server error fetching track',
        });
    }
  },
);
router.get(
  '/:id/play',
  authenticate,
  async (req: Request, res: Response) => {
    let stream: any = null;

    const MAX_CHUNK_SIZE = 1024 * 1024; // 1 MB

    let streamCompleted = false;
    let clientAborted = false;
    let cleanedUp = false;

    const cleanupStream = () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;

      if (stream && !stream.destroyed) {
        try {
          stream.destroy();
        } catch {
          // Ignore cleanup errors.
        }
      }
    };

    try {
      const { id } = req.params;

      /*
       * ============================================================
       * 1. Find audio metadata
       * ============================================================
       */

      const musicFile =
        await prisma.musicFile.findFirst({
          where: {
            trackId: id,
          },
        });

      if (!musicFile) {
        return res.status(404).json({
          error:
            'Audio file not found in library metadata',
        });
      }

      /*
       * ============================================================
       * 2. Connect to MEGA
       * ============================================================
       */

      await megaService.connect();

      /*
       * ============================================================
       * 3. Get MEGA file
       * ============================================================
       */

      const file =
        megaService.getFileByNodeId(
          musicFile.megaNodeId,
        );

      if (!file) {
        return res.status(404).json({
          error:
            'Audio file not found in storage node',
        });
      }

      /*
       * ============================================================
       * 4. File size
       * ============================================================
       */

      const fileSize =
        Number(musicFile.fileSize);

      if (
        !Number.isFinite(fileSize) ||
        fileSize <= 0
      ) {
        return res.status(500).json({
          error: 'Invalid audio file size',
        });
      }

      /*
       * ============================================================
       * 5. Content type
       * ============================================================
       */

      const contentType =
        musicFile.mimeType ||
        'audio/mpeg';

      /*
       * ============================================================
       * 6. Common headers
       * ============================================================
       */

      res.setHeader(
        'Accept-Ranges',
        'bytes',
      );

      res.setHeader(
        'Content-Type',
        contentType,
      );

      /*
       * Important:
       *
       * Do not disable caching completely.
       */

      res.setHeader(
        'Cache-Control',
        'private, max-age=0, must-revalidate',
      );

      /*
       * ============================================================
       * 7. Detect client abort
       * ============================================================
       *
       * req.aborted is the important signal here.
       *
       * Do NOT use res.close as the primary cancellation signal.
       */

      req.once('aborted', () => {
        clientAborted = true;

        console.log(
          `[STREAM] Client aborted request ${id}`,
        );

        cleanupStream();
      });

      /*
       * ============================================================
       * 8. Read Range
       * ============================================================
       */

      const rangeHeader =
        req.headers.range;

      /*
       * ============================================================
       * 9. No Range
       * ============================================================
       *
       * If the client does not request a Range,
       * stream the file normally.
       *
       * Browsers normally send Range requests when seeking.
       */

      if (!rangeHeader) {
        console.log(
          `[STREAM] No Range -> full stream 0-${fileSize - 1}/${fileSize}`,
        );

        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control':
            'private, max-age=0, must-revalidate',
        });

        stream =
          file.download();

        stream.once(
          'end',
          () => {
            streamCompleted = true;

            console.log(
              `[STREAM] Completed full stream ${id} (${fileSize} bytes)`,
            );
          },
        );

        stream.once(
          'error',
          (error: any) => {
            /*
             * Ignore expected errors after client abort.
             */

            if (
              clientAborted ||
              req.aborted
            ) {
              return;
            }

            console.error(
              `[STREAM] MEGA full-stream error for ${id}:`,
              error,
            );

            if (!res.headersSent) {
              res.status(502).end();
            } else {
              res.destroy();
            }
          },
        );

        res.once(
          'finish',
          () => {
            console.log(
              `[STREAM] HTTP response finished ${id}`,
            );
          },
        );

        stream.pipe(res);

        return;
      }

      /*
       * ============================================================
       * 10. Validate Range
       * ============================================================
       */

      if (
        !rangeHeader.startsWith(
          'bytes=',
        )
      ) {
        res.setHeader(
          'Content-Range',
          `bytes */${fileSize}`,
        );

        return res
          .status(416)
          .send(
            'Requested range not satisfiable',
          );
      }

      /*
       * ============================================================
       * 11. Parse first range
       * ============================================================
       *
       * Supported:
       *
       * bytes=0-500000
       * bytes=1000000-
       * bytes=-500000
       *
       * Ignore additional ranges.
       */

      const range =
        rangeHeader
          .replace(/^bytes=/, '')
          .split(',')[0]
          .trim();

      const [
        startPart,
        endPart,
      ] = range.split('-');

      let start: number;
      let requestedEnd: number;

      /*
       * ============================================================
       * 12. Suffix range
       * ============================================================
       */

      if (
        startPart === '' &&
        endPart !== ''
      ) {
        const suffixLength =
          Number(endPart);

        if (
          !Number.isInteger(
            suffixLength,
          ) ||
          suffixLength <= 0
        ) {
          res.setHeader(
            'Content-Range',
            `bytes */${fileSize}`,
          );

          return res
            .status(416)
            .send(
              'Requested range not satisfiable',
            );
        }

        start =
          Math.max(
            fileSize - suffixLength,
            0,
          );

        requestedEnd =
          fileSize - 1;
      } else {
        /*
         * ==========================================================
         * Normal range
         * ==========================================================
         */

        start =
          Number(startPart);

        if (
          !Number.isInteger(start) ||
          start < 0 ||
          start >= fileSize
        ) {
          res.setHeader(
            'Content-Range',
            `bytes */${fileSize}`,
          );

          return res
            .status(416)
            .send(
              'Requested range not satisfiable',
            );
        }

        /*
         * bytes=START-
         */

        if (endPart === '') {
          requestedEnd =
            fileSize - 1;
        } else {
          requestedEnd =
            Number(endPart);

          if (
            !Number.isInteger(
              requestedEnd,
            ) ||
            requestedEnd < start
          ) {
            res.setHeader(
              'Content-Range',
              `bytes */${fileSize}`,
            );

            return res
              .status(416)
              .send(
                'Requested range not satisfiable',
              );
          }

          requestedEnd =
            Math.min(
              requestedEnd,
              fileSize - 1,
            );
        }
      }

      /*
       * ============================================================
       * 13. Limit response to 1 MB
       * ============================================================
       */

      const end =
        Math.min(
          start +
            MAX_CHUNK_SIZE -
            1,
          requestedEnd,
          fileSize - 1,
        );

      const contentLength =
        end - start + 1;

      if (
        start < 0 ||
        end < start ||
        end >= fileSize ||
        contentLength <= 0
      ) {
        res.setHeader(
          'Content-Range',
          `bytes */${fileSize}`,
        );

        return res
          .status(416)
          .send(
            'Requested range not satisfiable',
          );
      }

      /*
       * ============================================================
       * 14. 206 Partial Content
       * ============================================================
       */

      console.log(
        `[STREAM] Range ${start}-${end}/${fileSize} ` +
        `(${contentLength} bytes) ` +
        `requested=${range}`,
      );

      res.writeHead(206, {
        'Content-Range':
          `bytes ${start}-${end}/${fileSize}`,

        'Accept-Ranges':
          'bytes',

        'Content-Length':
          contentLength,

        'Content-Type':
          contentType,

        'Cache-Control':
          'private, max-age=0, must-revalidate',
      });

      /*
       * ============================================================
       * 15. MEGA partial download
       * ============================================================
       */

      stream =
        file.download({
          start,
          end,
        });

      /*
       * ============================================================
       * 16. MEGA end
       * ============================================================
       */

      stream.once(
        'end',
        () => {
          streamCompleted = true;

          console.log(
            `[STREAM] MEGA chunk completed ` +
            `${start}-${end}/${fileSize}`,
          );
        },
      );

      /*
       * ============================================================
       * 17. MEGA error
       * ============================================================
       */

      stream.once(
        'error',
        (error: any) => {
          /*
           * A client seek normally aborts the previous request.
           *
           * Do not report this as a server failure.
           */

          if (
            clientAborted ||
            req.aborted
          ) {
            return;
          }

          console.error(
            `[STREAM] MEGA range error for ${id}:`,
            error,
          );

          if (!res.headersSent) {
            res.status(502).end();
          } else if (!res.destroyed) {
            res.destroy();
          }
        },
      );

      /*
       * ============================================================
       * 18. HTTP finish
       * ============================================================
       */

      res.once(
        'finish',
        () => {
          console.log(
            `[STREAM] HTTP chunk sent ` +
            `${start}-${end}/${fileSize}`,
          );
        },
      );

      /*
       * IMPORTANT:
       *
       * Do NOT destroy the MEGA stream from res.close.
       *
       * req.aborted above is the cancellation signal.
       */

      /*
       * ============================================================
       * 19. MEGA -> Express -> Client
       * ============================================================
       */

      stream.pipe(res);

      return;
    } catch (error) {
      /*
       * ============================================================
       * 20. Global error
       * ============================================================
       */

      if (
        clientAborted ||
        req.aborted
      ) {
        return;
      }

      console.error(
        `[STREAM] Playback error for ${req.params.id}:`,
        error,
      );

      cleanupStream();

      if (!res.headersSent) {
        return res.status(500).json({
          error:
            'Internal server error starting playback',
        });
      }

      if (!res.destroyed) {
        res.destroy();
      }
    }
  },
);

/*
 * ============================================================
 * POST /api/tracks/:id/save
 *
 * Adds an existing playable track to the authenticated user's
 * library. The compound unique key makes repeated requests safe.
 * ============================================================
 */
router.post(
  '/:id/save',
  authenticate,
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const { id: trackId } = req.params;
      const userId = req.user!.id;

      const track =
        await prisma.track.findUnique({
          where: {
            id: trackId,
          },
          include: {
            musicFiles: true,
            sources: true,
            artists: {
              include: {
                artist: true,
              },
            },
          },
        });

      if (!track || track.musicFiles.length === 0) {
        return res
          .status(404)
          .json({
            error:
              'Playable track not found',
          });
      }

      const userTrack =
        await prisma.userTrack.upsert({
          where: {
            userId_trackId: {
              userId,
              trackId,
            },
          },
          create: {
            userId,
            trackId,
          },
          update: {},
        });

      return res
        .status(200)
        .json({
          message:
            'Track saved to your library',
          saved: true,
          userTrack,
          track,
        });
    } catch (error) {
      console.error(
        'Save track to library error:',
        error,
      );

      return res
        .status(500)
        .json({
          error:
            'Internal server error saving track to your library',
        });
    }
  },
);

export default router;