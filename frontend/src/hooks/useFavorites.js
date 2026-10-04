import {
  useMemo,
} from 'react';

import { useAppStore } from '../store/appStore';
import { normalizeTrack } from '../utils/track';

export function useFavorites() {
  const favoriteTracks = useAppStore(
    (state) => state.favoriteTracks,
  );
  const setFavoriteTracks = useAppStore(
    (state) => state.setFavoriteTracks,
  );
  const favoriteIds = useAppStore(
    (state) => state.favoriteIds,
  );

  const safeFavoriteTracks = useMemo(
    () =>
      Array.isArray(favoriteTracks)
        ? favoriteTracks
        : [],
    [favoriteTracks],
  );

  const normalizedFavoriteTracks =
    useMemo(
      () =>
        safeFavoriteTracks.map(
          normalizeTrack,
        ),
      [safeFavoriteTracks],
    );

  return {
    favoriteTracks,
    setFavoriteTracks,
    favoriteIds,
    normalizedFavoriteTracks,
  };
}
