import { Router, Request, Response } from 'express';
import { Readable } from 'node:stream';

import { prisma } from '../config/db';

import {
  extractYouTubeVideoId,
  resolveYouTubeAudio,
  youtubeService,
} from '../services/youtubeService';

import {
  deduplicationService,
  normalizeTitle,
  normalizeArtist,
} from '../services/deduplicationService';

import { megaService } from '../services/megaService';
import { authenticate } from '../middleware/auth';

const router = Router();

/* =========================================================
   POST /api/share/youtube

   YouTube Share / Metadata / Deduplication
========================================================= */

router.post(
  '/youtube',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const {
        url,
        forceCreate,
        useExistingTrackId,
      } = req.body;

      if (!url) {
        return res.status(400).json({
          error: 'YouTube URL is required',
        });
      }

      const videoId =
        extractYouTubeVideoId(url);

      if (!videoId) {
        return res.status(400).json({
          error:
            'Invalid YouTube URL or Video ID',
        });
      }

      /* =====================================================
         1. Fetch metadata
      ===================================================== */

      let metadata;

      try {
        metadata =
          await youtubeService.getVideoMetadata(
            videoId,
          );
      } catch (err: any) {
        console.error(
          '[YouTube Share] Metadata error:',
          err,
        );

        return res.status(404).json({
          error:
            err?.message ||
            'YouTube metadata unavailable',
        });
      }

      /* =====================================================
         2. Handle manual duplicate resolution
      ===================================================== */

      if (useExistingTrackId) {
        const existingTrack =
          await prisma.track.findUnique({
            where: {
              id: useExistingTrackId,
            },
          });

        if (!existingTrack) {
          return res.status(404).json({
            error:
              'Selected track not found',
          });
        }

        await deduplicationService.linkSourceToTrack(
          existingTrack.id,
          videoId,
        );

        const availability =
          await checkAudioAvailability(
            existingTrack.id,
          );

        return res.status(200).json({
          status:
            availability.status,

          track:
            existingTrack,

          metadata,
        });
      }

      /* =====================================================
         3. Normal deduplication
      ===================================================== */

      const dedup =
        await deduplicationService.findDuplicate(
          videoId,
          metadata.title,
          metadata.channelTitle,
          metadata.duration,
        );

      if (
        dedup.matchType !== 'NONE' &&
        dedup.track
      ) {
        const track =
          dedup.track;

        /*
         * Moderate fuzzy match.
         */
        if (
          dedup.matchType ===
          'FUZZY_MATCH' &&
          dedup.confidence < 0.85 &&
          !forceCreate
        ) {
          return res.status(200).json({
            status:
              'POSSIBLE_DUPLICATE',

            confidence:
              dedup.confidence,

            track: {
              id: track.id,
              title: track.title,
              artist: track.artist,
              album: track.album,
              thumbnailUrl:
                track.thumbnailUrl,
              duration:
                track.duration,
            },

            metadata,
          });
        }

        /*
         * Exact/high-confidence match.
         */
        const availability =
          await checkAudioAvailability(
            track.id,
          );

        return res.status(200).json({
          status:
            availability.status,

          track,

          metadata,
        });
      }

      /* =====================================================
         4. Admin force-create
      ===================================================== */

      if (
        forceCreate &&
        req.user?.role === 'ADMIN'
      ) {
        const normTitle =
          normalizeTitle(
            metadata.title,
          );

        const normArtist =
          normalizeArtist(
            metadata.channelTitle,
          );

        const newTrack =
          await prisma.track.create({
            data: {
              title:
                metadata.title,

              normalizedTitle:
                normTitle,

              artist:
                metadata.channelTitle,

              normalizedArtist:
                normArtist,

              thumbnailUrl:
                metadata.thumbnailUrl,

              duration:
                metadata.duration,

              sources: {
                create: {
                  provider:
                    'youtube',

                  sourceId:
                    videoId,

                  sourceUrl:
                    `https://www.youtube.com/watch?v=${videoId}`,
                },
              },
            },
          });

        return res.status(201).json({
          status:
            'AUDIO_MISSING',

          track:
            newTrack,

          metadata,
        });
      }

      /* =====================================================
         5. Not available in local MEGA library
      ===================================================== */

      return res.status(200).json({
        status:
          'NOT_AVAILABLE',

        metadata,
      });
    } catch (error) {
      console.error(
        'Share YouTube processing error:',
        error,
      );

      return res.status(500).json({
        error:
          'Internal server error during share processing',
      });
    }
  },
);

/* =========================================================
   GET /api/share/youtube/audio

   YouTube Audio Proxy

   Example:

   /api/share/youtube/audio?id=dQw4w9WgXcQ

   The browser never needs the temporary YouTube
   CDN URL. It requests audio through Aura backend.
========================================================= */

router.get(
  '/youtube/audio',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      /* ===================================================
         1. Get YouTube ID
      =================================================== */

      const rawId =
        typeof req.query.id === 'string'
          ? req.query.id.trim()
          : '';

      if (!rawId) {
        return res.status(400).json({
          error:
            'YouTube video ID is required',
        });
      }

      const videoId =
        extractYouTubeVideoId(
          rawId,
        );

      if (!videoId) {
        return res.status(400).json({
          error:
            'Invalid YouTube video ID or URL',
        });
      }

      /* ===================================================
         2. Audio quality
      =================================================== */

      const rawQuality =
        typeof req.query.quality === 'string'
          ? req.query.quality
          : 'high';

      let quality:
        | 'low'
        | 'medium'
        | 'high' = 'high';

      if (
        rawQuality === 'low' ||
        rawQuality === 'medium' ||
        rawQuality === 'high'
      ) {
        quality =
          rawQuality;
      }

      console.log(
        `[YouTube Audio] Resolving ${videoId} (${quality})`,
      );

      /* ===================================================
         3. Resolve audio

         youtubei.js
              ↓
         yt-dlp fallback
      =================================================== */

      const stream =
        await resolveYouTubeAudio(
          videoId,
          quality,
        );

      if (
        !stream ||
        !stream.url
      ) {
        return res.status(404).json({
          error:
            'YouTube audio stream unavailable',
        });
      }

      console.log(
        `[YouTube Audio] Resolved using ${stream.source}`,
      );

      /* ===================================================
         4. Forward Range header

         Required for:
         - seeking
         - next/previous position
         - browser audio controls
      =================================================== */

      const range =
        typeof req.headers.range === 'string'
          ? req.headers.range
          : undefined;

      const upstreamHeaders: Record<string, string> = {
        'User-Agent':
          req.headers['user-agent'] ||
          'Mozilla/5.0',
      };

      if (range) {
        upstreamHeaders.Range =
          range;

        console.log(
          `[YouTube Audio] Range: ${range}`,
        );
      }

      /* ===================================================
         5. Request YouTube CDN
      =================================================== */

      const upstream =
        await fetch(
          stream.url,
          {
            method: 'GET',
            headers:
              upstreamHeaders,
          },
        );

      console.log(
        `[YouTube Audio] Upstream status: ${upstream.status}`,
      );

      /* ===================================================
         6. Validate upstream
      =================================================== */

      if (
        !upstream.ok &&
        upstream.status !== 206
      ) {
        console.error(
          '[YouTube Audio] Upstream error:',
          upstream.status,
          upstream.statusText,
        );

        return res.status(502).json({
          error:
            'Unable to fetch YouTube audio stream',

          upstreamStatus:
            upstream.status,

          upstreamStatusText:
            upstream.statusText,
        });
      }

      /* ===================================================
         7. Content-Type
      =================================================== */

      const contentType =
        upstream.headers.get(
          'content-type',
        ) ||
        stream.mimeType ||
        'audio/webm';

      res.setHeader(
        'Content-Type',
        contentType,
      );

      /* ===================================================
         8. Range support
      =================================================== */

      res.setHeader(
        'Accept-Ranges',
        'bytes',
      );

      /* ===================================================
         9. Content-Length
      =================================================== */

      const contentLength =
        upstream.headers.get(
          'content-length',
        );

      if (contentLength) {
        res.setHeader(
          'Content-Length',
          contentLength,
        );
      }

      /* ===================================================
         10. Content-Range
      =================================================== */

      const contentRange =
        upstream.headers.get(
          'content-range',
        );

      if (contentRange) {
        res.setHeader(
          'Content-Range',
          contentRange,
        );
      }

      /* ===================================================
         11. Cache control
      =================================================== */

      res.setHeader(
        'Cache-Control',
        'no-store',
      );

      /* ===================================================
         12. Expose audio headers to browser
      =================================================== */

      res.setHeader(
        'Access-Control-Expose-Headers',
        [
          'Content-Length',
          'Content-Range',
          'Accept-Ranges',
          'Content-Type',
        ].join(', '),
      );

      /* ===================================================
         13. Preserve upstream status

         200 → normal stream
         206 → partial/range stream
      =================================================== */

      if (
        upstream.status === 206
      ) {
        res.status(206);
      } else {
        res.status(200);
      }

      /* ===================================================
         14. Check response body
      =================================================== */

      if (!upstream.body) {
        console.error(
          '[YouTube Audio] Upstream returned empty body',
        );

        return res.end();
      }

      /* ===================================================
         15. Convert WebStream → Node Stream
      =================================================== */

      const readable =
        Readable.fromWeb(
          upstream.body as any,
        );

      /* ===================================================
         16. Cleanup when browser disconnects
      =================================================== */

      const cleanup = () => {
        if (!readable.destroyed) {
          try {
            readable.destroy();
          } catch {
            // Ignore cleanup error
          }
        }
      };

      req.once(
        'aborted',
        cleanup,
      );

      req.once(
        'close',
        cleanup,
      );

      res.once(
        'close',
        cleanup,
      );

      /* ===================================================
         17. Stream error
      =================================================== */

      readable.on(
        'error',
        (error) => {
          console.error(
            '[YouTube Audio] Readable stream error:',
            error,
          );

          if (!res.destroyed) {
            try {
              res.destroy(
                error as Error,
              );
            } catch {
              // Ignore
            }
          }
        },
      );

      /* ===================================================
         18. Stream YouTube → Aura → Browser
      =================================================== */

      readable.pipe(res);
    } catch (error: any) {
      console.error(
        '[YouTube Audio] Fatal error:',
        error,
      );

      /*
       * Headers may already have been sent
       * if streaming started.
       */
      if (res.headersSent) {
        try {
          res.destroy();
        } catch {
          // Ignore
        }

        return;
      }

      return res.status(500).json({
        error:
          'Failed to stream YouTube audio',

        message:
          error?.message ||
          'Unknown error',
      });
    }
  },
);

/* =========================================================
   CHECK MEGA AUDIO AVAILABILITY
========================================================= */

/**
 * Validates audio file status in PostgreSQL and MEGA.
 */
async function checkAudioAvailability(
  trackId: string,
): Promise<{
  status:
  | 'AVAILABLE'
  | 'AUDIO_MISSING';
}> {
  const musicFile =
    await prisma.musicFile.findFirst({
      where: {
        trackId,
      },
    });

  if (!musicFile) {
    return {
      status:
        'AUDIO_MISSING',
    };
  }

  try {
    /*
     * Look up node directly in MEGA.
     */
    const file =
      megaService.getFileByNodeId(
        musicFile.megaNodeId,
      );

    if (!file) {
      console.warn(
        `Database record exists for MusicFile ${musicFile.id} but missing from MEGA. Marking unavailable.`,
      );

      return {
        status:
          'AUDIO_MISSING',
      };
    }

    return {
      status:
        'AVAILABLE',
    };
  } catch (err) {
    console.error(
      'Error contacting MEGA storage:',
      err,
    );

    /*
     * Safe fallback if MEGA connection
     * times out.
     */
    return {
      status:
        'AUDIO_MISSING',
    };
  }
}

export default router;