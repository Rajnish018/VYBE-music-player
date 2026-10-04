import {
  useMemo,
} from 'react';

import { useAppStore } from '../store/appStore';
import { normalizeTrack } from '../utils/track';

export function useLibrary() {
  const tracks = useAppStore(
    (state) => state.tracks,
  );
  const setTracks = useAppStore(
    (state) => state.setTracks,
  );
  const libraryTracks = useAppStore(
    (state) => state.libraryTracks,
  );
  const activeIndex = useAppStore(
    (state) => state.activeIndex,
  );
  const setActiveIndex = useAppStore(
    (state) => state.setActiveIndex,
  );
  const isLoadingLibrary = useAppStore(
    (state) => state.isLoadingLibrary,
  );
  const query = useAppStore(
    (state) => state.query,
  );
  const setQuery = useAppStore(
    (state) => state.setQuery,
  );
  const apiState = useAppStore(
    (state) => state.apiState,
  );
  const dataError = useAppStore(
    (state) => state.dataError,
  );
  const refreshLibrary = useAppStore(
    (state) => state.refreshLibrary,
  );

  const normalizedLibraryTracks = useMemo(
    () =>
      libraryTracks.map(normalizeTrack),
    [libraryTracks],
  );

  const featuredTracks = useMemo(
    () =>
      normalizedLibraryTracks.slice(0, 8),
    [normalizedLibraryTracks],
  );

  const recentlyAddedTracks = useMemo(
    () =>
      normalizedLibraryTracks
        .slice(-6)
        .reverse(),
    [normalizedLibraryTracks],
  );

  const filteredLibraryTracks = useMemo(() => {
    const cleanQuery =
      query.trim().toLowerCase();

    if (!cleanQuery) {
      return normalizedLibraryTracks;
    }

    return normalizedLibraryTracks.filter(
      (track) =>
        `${track.title} ${track.artist} ${track.album}`
          .toLowerCase()
          .includes(cleanQuery),
    );
  }, [
    normalizedLibraryTracks,
    query,
  ]);

  return {
    tracks,
    setTracks,
    libraryTracks,
    activeIndex,
    setActiveIndex,
    isLoadingLibrary,
    query,
    setQuery,
    apiState,
    dataError,
    featuredTracks,
    recentlyAddedTracks,
    filteredLibraryTracks,
    refreshLibrary,
  };
}
