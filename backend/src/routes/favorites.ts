import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/favorites
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.user!.id },
      include: {
        track: {
          include: {
            musicFiles: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    // Return list of tracks
    const tracks = favorites.map(fav => fav.track);
    return res.status(200).json(tracks);
  } catch (error) {
    console.error('Fetch favorites error:', error);
    return res.status(500).json({ error: 'Internal server error fetching favorites' });
  }
});

// POST /api/favorites/:trackId
router.post('/:trackId', authenticate, async (req: Request, res: Response) => {
  try {
    const { trackId } = req.params;

    // Check if track exists
    const track = await prisma.track.findUnique({
      where: { id: trackId }
    });

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    // Check if already favorited
    const existing = await prisma.favorite.findUnique({
      where: {
        userId_trackId: {
          userId: req.user!.id,
          trackId
        }
      }
    });

    if (existing) {
      return res.status(200).json({ message: 'Track is already in favorites', track });
    }

    // Create favorite
    await prisma.favorite.create({
      data: {
        userId: req.user!.id,
        trackId
      }
    });

    return res.status(201).json({ message: 'Track added to favorites', track });
  } catch (error) {
    console.error('Add favorite error:', error);
    return res.status(500).json({ error: 'Internal server error favoriting track' });
  }
});

// DELETE /api/favorites/:trackId
router.delete('/:trackId', authenticate, async (req: Request, res: Response) => {
  try {
    const { trackId } = req.params;

    // Check if favorited
    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_trackId: {
          userId: req.user!.id,
          trackId
        }
      }
    });

    if (!favorite) {
      return res.status(404).json({ error: 'Favorite not found' });
    }

    // Delete favorite
    await prisma.favorite.delete({
      where: {
        userId_trackId: {
          userId: req.user!.id,
          trackId
        }
      }
    });

    return res.status(200).json({ message: 'Track removed from favorites successfully' });
  } catch (error) {
    console.error('Remove favorite error:', error);
    return res.status(500).json({ error: 'Internal server error unfavoriting track' });
  }
});

export default router;
