import { tracksApi } from '../api';

/**
 * Save an existing Aura/MEGA track to the
 * authenticated user's personal library.
 *
 * Flow:
 *
 * UI
 *   ↓
 * POST /api/tracks/:id/save
 *   ↓
 * backend creates UserTrack
 *   ↓
 * backend returns Track
 *   ↓
 * addTrackToLibrary(track)
 *   ↓
 * Library updates immediately
 *
 * IMPORTANT:
 * This handler is ONLY for real Prisma Track IDs.
 *
 * YouTube IDs must NOT be sent here.
 * YouTube saving will be handled separately later.
 */
export async function saveTrackToLibrary({
  trackId,
  token,
  libraryTracks = [],
  addTrackToLibrary,
  setPlaybackError,
  logout,
}) {
  if (!trackId) {
    return null;
  }

  if (!token) {
    const error = new Error(
      'You must be logged in to save a track.',
    );

    setPlaybackError?.(error.message);

    return null;
  }

  /*
   * Prevent duplicate save requests from the UI.
   */
  const alreadySaved = Array.isArray(
    libraryTracks,
  )
    ? libraryTracks.some(
        (track) =>
          String(track?.id) ===
          String(trackId),
      )
    : false;

  if (alreadySaved) {
    return {
      saved: true,
      alreadySaved: true,
    };
  }

  try {
    const data =
      await tracksApi.saveToLibrary(
        trackId,
        token,
      );

    /*
     * Backend returns:
     *
     * {
     *   message,
     *   saved,
     *   userTrack,
     *   track
     * }
     */
    const savedTrack = data?.track;

    /*
     * This is the important part:
     *
     * Do NOT reload the whole library.
     *
     * Insert the returned Track directly
     * into Zustand's libraryTracks.
     */
    if (savedTrack?.id) {
      addTrackToLibrary?.(
        savedTrack,
      );
    }

    return data;
  } catch (error) {
    /*
     * Session expired.
     */
    if (error?.status === 401) {
      logout?.();
      return null;
    }

    const message =
      error?.message ||
      'Unable to save track to your library.';

    setPlaybackError?.(message);

    return null;
  }
}