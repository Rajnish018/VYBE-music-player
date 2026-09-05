import {
  Router,
  Request,
  Response,
} from 'express';

import { prisma } from '../config/db';

import { authenticate } from '../middleware/auth';

import { megaService } from '../services/megaService';

import {
  youtubeService,
} from '../services/youtubeService';

const router =
  Router();

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
 * GET /api/tracks/search
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
       * YouTube search.
       */
      if (
        req.query.source ===
        'youtube'
      ) {
        if (
          !process.env.YOUTUBE_API_KEY?.trim()
        ) {
          return res
            .status(503)
            .json({
              error:
                'YouTube discovery is not configured on this server.',
            });
        }

        const results =
          await youtubeService.searchVideos(
            query,
          );

        return res
          .status(200)
          .json(results);
      }

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

/*
 * ============================================================
 * GET /api/tracks/:id/play
 *
 * Protected audio streaming.
 * ============================================================
 */
router.get(
  '/:id/play',
  authenticate,
  async (
    req: Request,
    res: Response,
  ) => {
    let stream: any = null;

    try {
      const { id } = req.params;

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

      await megaService.connect();

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

      const fileSize = Number(
        musicFile.fileSize,
      );

      if (
        !Number.isFinite(fileSize) ||
        fileSize <= 0
      ) {
        return res.status(500).json({
          error: 'Invalid audio file size',
        });
      }

      const contentType =
        musicFile.mimeType ||
        'audio/mpeg';

      const rangeHeader =
        req.headers.range;

      /*
       * NO RANGE REQUEST
       */
      if (!rangeHeader) {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, no-cache',
        });

        console.log(
          `[STREAM] Full file ${id} (${fileSize} bytes)`,
        );

        stream = file.download();

        stream.on(
          'error',
          (error: any) => {
            console.error(
              `[STREAM] MEGA error for ${id}:`,
              error,
            );

            if (!res.headersSent) {
              res.status(500).end();
            } else {
              res.destroy();
            }
          },
        );

        res.on('close', () => {
          if (
            stream &&
            !stream.destroyed
          ) {
            stream.destroy();
          }
        });

        stream.pipe(res);
        return;
      }

      /*
       * RANGE REQUEST
       *
       * Supports:
       * bytes=START-END
       * bytes=START-
       * bytes=-SUFFIX_LENGTH
       */
      if (
        !rangeHeader.startsWith('bytes=')
      ) {
        res.setHeader(
          'Content-Range',
          `bytes */${fileSize}`,
        );

        return res.status(416).send(
          'Requested range not satisfiable',
        );
      }

      const range = rangeHeader
        .replace(/^bytes=/, '')
        .split(',')[0]
        .trim();

      const [startPart, endPart] =
        range.split('-');

      let start: number;
      let end: number;

      /*
       * bytes=-500
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

          return res.status(416).send(
            'Requested range not satisfiable',
          );
        }

        start = Math.max(
          fileSize - suffixLength,
          0,
        );

        end = fileSize - 1;
      } else {
        /*
         * bytes=START-END
         * bytes=START-
         */
        start = Number(startPart);

        if (
          !Number.isInteger(start) ||
          start < 0 ||
          start >= fileSize
        ) {
          res.setHeader(
            'Content-Range',
            `bytes */${fileSize}`,
          );

          return res.status(416).send(
            'Requested range not satisfiable',
          );
        }

        if (endPart === '') {
          end = fileSize - 1;
        } else {
          end = Number(endPart);

          if (
            !Number.isInteger(end) ||
            end < start
          ) {
            res.setHeader(
              'Content-Range',
              `bytes */${fileSize}`,
            );

            return res.status(416).send(
              'Requested range not satisfiable',
            );
          }

          end = Math.min(
            end,
            fileSize - 1,
          );
        }
      }

      const contentLength =
        end - start + 1;

      res.writeHead(206, {
        'Content-Range':
          `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': contentLength,
        'Content-Type': contentType,
        'Cache-Control': 'private, no-cache',
      });

      console.log(
        `[STREAM] Range ${start}-${end}/${fileSize} for track ${id}`,
      );

      stream = file.download({
        start,
        end,
      });

      stream.on(
        'error',
        (error: any) => {
          console.error(
            `[STREAM] MEGA range error for ${id}:`,
            error,
          );

          if (!res.headersSent) {
            res.status(500).end();
          } else {
            res.destroy();
          }
        },
      );

      res.on('close', () => {
        // if (
        //   stream &&
        //   !stream.destroyed
        // ) {
        //   stream.destroy();
        // }
      });

      stream.pipe(res);
      return;
    } catch (error) {
      console.error(
        'Playback streaming error:',
        error,
      );

      // if (
      //   stream &&
      //   !stream.destroyed
      // ) {
      //   stream.destroy();
      // }

      if (!res.headersSent) {
        return res.status(500).json({
          error:
            'Internal server error starting playback',
        });
      }

      res.destroy();
    }
  },
);

export default router;
