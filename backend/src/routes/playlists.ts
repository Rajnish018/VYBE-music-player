import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/playlists
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const playlists = await prisma.playlist.findMany({
      where: { userId: req.user!.id },
      include: {
        playlistTracks: {
          include: { track: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json(playlists);
  } catch (error) {
    console.error('Fetch playlists error:', error);
    return res.status(500).json({ error: 'Internal server error fetching playlists' });
  }
});

// POST /api/playlists
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }

    const playlist = await prisma.playlist.create({
      data: {
        name,
        userId: req.user!.id
      }
    });

    return res.status(201).json(playlist);
  } catch (error) {
    console.error('Create playlist error:', error);
    return res.status(500).json({ error: 'Internal server error creating playlist' });
  }
});

// GET /api/playlists/:id
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const playlist = await prisma.playlist.findFirst({
      where: { id, userId: req.user!.id },
      include: {
        playlistTracks: {
          orderBy: { order: 'asc' },
          include: { track: true }
        }
      }
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    return res.status(200).json(playlist);
  } catch (error) {
    console.error('Fetch playlist detail error:', error);
    return res.status(500).json({ error: 'Internal server error fetching playlist details' });
  }
});

// PATCH /api/playlists/:id
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }

    const playlist = await prisma.playlist.findFirst({
      where: { id, userId: req.user!.id }
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const updatedPlaylist = await prisma.playlist.update({
      where: { id },
      data: { name }
    });

    return res.status(200).json(updatedPlaylist);
  } catch (error) {
    console.error('Rename playlist error:', error);
    return res.status(500).json({ error: 'Internal server error updating playlist' });
  }
});

// DELETE /api/playlists/:id
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const playlist = await prisma.playlist.findFirst({
      where: { id, userId: req.user!.id }
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    await prisma.playlist.delete({
      where: { id }
    });

    return res.status(200).json({ message: 'Playlist deleted successfully' });
  } catch (error) {
    console.error('Delete playlist error:', error);
    return res.status(500).json({ error: 'Internal server error deleting playlist' });
  }
});

// POST /api/playlists/:id/tracks
router.post('/:id/tracks', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { trackId } = req.body;

    if (!trackId) {
      return res.status(400).json({ error: 'trackId is required' });
    }

    // Verify playlist belongs to user
    const playlist = await prisma.playlist.findFirst({
      where: { id, userId: req.user!.id }
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Check if track exists and is playable
    const track = await prisma.track.findUnique({
      where: { id: trackId }
    });

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    // Check if already in playlist
    const existing = await prisma.playlistTrack.findFirst({
      where: { playlistId: id, trackId }
    });

    if (existing) {
      return res.status(400).json({ error: 'Track is already in playlist' });
    }

    // Get current maximum order index
    const lastTrack = await prisma.playlistTrack.findFirst({
      where: { playlistId: id },
      orderBy: { order: 'desc' }
    });
    const order = lastTrack ? lastTrack.order + 1 : 0;

    const playlistTrack = await prisma.playlistTrack.create({
      data: {
        playlistId: id,
        trackId,
        order
      },
      include: { track: true }
    });

    return res.status(201).json(playlistTrack);
  } catch (error) {
    console.error('Add track to playlist error:', error);
    return res.status(500).json({ error: 'Internal server error adding track' });
  }
});

// DELETE /api/playlists/:id/tracks/:trackId
router.delete('/:id/tracks/:trackId', authenticate, async (req: Request, res: Response) => {
  try {
    const { id, trackId } = req.params;

    // Verify playlist belongs to user
    const playlist = await prisma.playlist.findFirst({
      where: { id, userId: req.user!.id }
    });

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Delete association
    const relation = await prisma.playlistTrack.findFirst({
      where: { playlistId: id, trackId }
    });

    if (!relation) {
      return res.status(404).json({ error: 'Track not found in this playlist' });
    }

    await prisma.playlistTrack.delete({
      where: { id: relation.id }
    });

    return res.status(200).json({ message: 'Track removed from playlist successfully' });
  } catch (error) {
    console.error('Remove track from playlist error:', error);
    return res.status(500).json({ error: 'Internal server error removing track' });
  }
});

export default router;
