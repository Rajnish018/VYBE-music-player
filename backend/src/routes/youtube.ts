import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { extractYouTubeVideoId, youtubeService } from '../services/youtubeService';
import { deduplicationService, normalizeTitle, normalizeArtist } from '../services/deduplicationService';
import { megaService } from '../services/megaService';
import { authenticate } from '../middleware/auth';

const router = Router();

// POST /api/share/youtube
router.post('/youtube', authenticate, async (req: Request, res: Response) => {
  try {
    const { url, forceCreate, useExistingTrackId } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL or Video ID' });
    }

    // 1. Fetch metadata from YouTube
    let metadata;
    try {
      metadata = await youtubeService.getVideoMetadata(videoId);
    } catch (err: any) {
      return res.status(404).json({ error: err.message || 'YouTube metadata unavailable' });
    }

    // 2. Handle manual duplicate resolution from the client
    if (useExistingTrackId) {
      const existingTrack = await prisma.track.findUnique({
        where: { id: useExistingTrackId }
      });

      if (!existingTrack) {
        return res.status(404).json({ error: 'Selected track not found' });
      }

      // Link source to this track
      await deduplicationService.linkSourceToTrack(existingTrack.id, videoId);
      
      // Check audio availability
      const availability = await checkAudioAvailability(existingTrack.id);
      return res.status(200).json({
        status: availability.status,
        track: existingTrack,
        metadata
      });
    }

    // 3. Normal deduplication check
    const dedup = await deduplicationService.findDuplicate(
      videoId,
      metadata.title,
      metadata.channelTitle,
      metadata.duration
    );

    if (dedup.matchType !== 'NONE' && dedup.track) {
      // High or exact match
      const track = dedup.track;

      if (dedup.matchType === 'FUZZY_MATCH' && dedup.confidence < 0.85 && !forceCreate) {
        // Moderate similarity, return possible duplicate list for user choice
        return res.status(200).json({
          status: 'POSSIBLE_DUPLICATE',
          confidence: dedup.confidence,
          track: {
            id: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album,
            thumbnailUrl: track.thumbnailUrl,
            duration: track.duration
          },
          metadata
        });
      }

      // Otherwise, auto-resolve to this track
      const availability = await checkAudioAvailability(track.id);
      return res.status(200).json({
        status: availability.status,
        track,
        metadata
      });
    }

    // 4. If no track matches, it's not available in the authorized library
    // Create the metadata placeholder only if forceCreate is true (admin/testing utility),
    // otherwise general users receive NOT_AVAILABLE.
    if (forceCreate && req.user?.role === 'ADMIN') {
      const normTitle = normalizeTitle(metadata.title);
      const normArtist = normalizeArtist(metadata.channelTitle);

      const newTrack = await prisma.track.create({
        data: {
          title: metadata.title,
          normalizedTitle: normTitle,
          artist: metadata.channelTitle,
          normalizedArtist: normArtist,
          thumbnailUrl: metadata.thumbnailUrl,
          duration: metadata.duration,
          sources: {
            create: {
              provider: 'youtube',
              sourceId: videoId,
              sourceUrl: `https://www.youtube.com/watch?v=${videoId}`
            }
          }
        }
      });

      return res.status(201).json({
        status: 'AUDIO_MISSING',
        track: newTrack,
        metadata
      });
    }

    return res.status(200).json({
      status: 'NOT_AVAILABLE',
      metadata
    });

  } catch (error) {
    console.error('Share YouTube processing error:', error);
    return res.status(500).json({ error: 'Internal server error during share processing' });
  }
});

/**
 * Validates audio file status in PostgreSQL and MEGA
 */
async function checkAudioAvailability(trackId: string): Promise<{ status: 'AVAILABLE' | 'AUDIO_MISSING' }> {
  const musicFile = await prisma.musicFile.findFirst({
    where: { trackId }
  });

  if (!musicFile) {
    return { status: 'AUDIO_MISSING' };
  }

  try {
    // Look up node directly in MEGA
    const file = megaService.getFileByNodeId(musicFile.megaNodeId);
    if (!file) {
      // Record exists but file deleted from MEGA
      console.warn(`Database record exists for MusicFile ${musicFile.id} but missing from MEGA. Marking unavailable.`);
      return { status: 'AUDIO_MISSING' };
    }

    return { status: 'AVAILABLE' };
  } catch (err) {
    console.error('Error contacting MEGA storage:', err);
    // Safe fallback if MEGA connection times out
    return { status: 'AUDIO_MISSING' };
  }
}

export default router;
