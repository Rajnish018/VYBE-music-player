import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/history
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const history = await prisma.playbackHistory.findMany({
      where: { userId: req.user!.id },
      include: {
        track: {
          include: {
            musicFiles: true
          }
        }
      },
      orderBy: { lastPlayedAt: 'desc' },
      take: 20 // limit to recently played
    });
    
    // Return unique recently played tracks
    const tracks: any[] = [];
    const seen = new Set<string>();
    
    for (const entry of history) {
      if (!seen.has(entry.trackId) && entry.track) {
        seen.add(entry.trackId);
        tracks.push({
          ...entry.track,
          lastPlayedAt: entry.lastPlayedAt,
          position: entry.position
        });
      }
    }

    return res.status(200).json(tracks);
  } catch (error) {
    console.error('Fetch history error:', error);
    return res.status(500).json({ error: 'Internal server error fetching playback history' });
  }
});

// POST /api/history
// Adds or updates a playback history record
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { trackId, position } = req.body;

    if (!trackId) {
      return res.status(400).json({ error: 'trackId is required' });
    }

    // Verify track exists
    const track = await prisma.track.findUnique({
      where: { id: trackId }
    });

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    // Check if entry already exists
    const existing = await prisma.playbackHistory.findFirst({
      where: {
        userId: req.user!.id,
        trackId
      }
    });

    let historyRecord;

    if (existing) {
      // Update existing record
      historyRecord = await prisma.playbackHistory.update({
        where: { id: existing.id },
        data: {
          lastPlayedAt: new Date(),
          position: position !== undefined ? Number(position) : existing.position
        }
      });
    } else {
      // Create new record
      historyRecord = await prisma.playbackHistory.create({
        data: {
          userId: req.user!.id,
          trackId,
          position: position !== undefined ? Number(position) : null
        }
      });
    }

    return res.status(200).json(historyRecord);
  } catch (error) {
    console.error('Update history error:', error);
    return res.status(500).json({ error: 'Internal server error recording playback history' });
  }
});

export default router;
