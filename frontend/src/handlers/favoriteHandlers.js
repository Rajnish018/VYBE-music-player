import { favoritesApi } from '../api';

export async function toggleFavorite({
  trackId,
  token,
  favoriteIds,
  setFavoriteTracks,
  setPlaybackError,
  logout,
}) {
  try {
    if (favoriteIds.has(trackId)) {
      await favoritesApi.remove(trackId, token);
      setFavoriteTracks((current) => current.filter((track) => track.id !== trackId));
      return;
    }

    const { track } = await favoritesApi.add(trackId, token);
    setFavoriteTracks((current) => [track, ...current]);
  } catch (error) {
    if (error.status === 401) logout();
    setPlaybackError(error.message || 'Could not update favorites.');
  }
}
