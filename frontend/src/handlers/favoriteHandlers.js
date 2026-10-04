import { favoritesApi } from '../api';
import { useAppStore } from '../store/appStore';

function findTrack(trackId) {
  const { libraryTracks, tracks } =
    useAppStore.getState();

  return (
    libraryTracks.find(
      (track) => track.id === trackId,
    ) ||
    tracks.find(
      (track) => track.id === trackId,
    ) ||
    null
  );
}

function setPending(trackId, pending) {
  useAppStore.setState((state) => {
    const pendingFavoriteTrackIds =
      new Set(
        state.pendingFavoriteTrackIds,
      );

    if (pending) {
      pendingFavoriteTrackIds.add(trackId);
    } else {
      pendingFavoriteTrackIds.delete(trackId);
    }

    return {
      pendingFavoriteTrackIds,
    };
  });
}

export async function toggleFavorite({
  trackId,
  token,
  favoriteIds,
  setFavoriteTracks,
  setPlaybackError,
  logout,
}) {
  const {
    pendingFavoriteTrackIds,
    favoriteTracks,
  } = useAppStore.getState();

  if (
    pendingFavoriteTrackIds.has(trackId)
  ) {
    return;
  }

  const wasFavorite =
    favoriteIds.has(trackId);

  const previousFavorites =
    favoriteTracks;

  setPending(trackId, true);

  try {
    if (wasFavorite) {
      setFavoriteTracks((current) =>
        current.filter(
          (track) => track.id !== trackId,
        ),
      );

      await favoritesApi.remove(
        trackId,
        token,
      );

      return;
    }

    const optimisticTrack =
      findTrack(trackId);

    if (optimisticTrack) {
      setFavoriteTracks((current) => {
        if (
          current.some(
            (track) =>
              track.id === trackId,
          )
        ) {
          return current;
        }

        return [
          optimisticTrack,
          ...current,
        ];
      });
    }

    const { track } =
      await favoritesApi.add(
        trackId,
        token,
      );

    if (track) {
      setFavoriteTracks((current) => {
        const withoutTrack =
          current.filter(
            (item) =>
              item.id !== trackId,
          );

        return [
          track,
          ...withoutTrack,
        ];
      });
    }
  } catch (error) {
    setFavoriteTracks(
      previousFavorites,
    );

    if (error.status === 401) {
      logout();
      return;
    }

    setPlaybackError(
      error.message ||
        'Could not update favorites.',
    );
  } finally {
    setPending(trackId, false);
  }
}
