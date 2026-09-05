import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { tracksApi } from '../api';
import { normalizeTrack } from '../utils/track';

export function useLibrary({
  token,
  authReady,
  clearSession,
}) {
  const [tracks, setTracks] = useState([]);
  const [libraryTracks, setLibraryTracks] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const [isLoadingLibrary, setIsLoadingLibrary] =
    useState(false);

  const [dataError, setDataError] = useState('');

  const [query, setQuery] = useState('');

  const [apiState, setApiState] = useState({
    label: 'Not connected',
    detail:
      'Apply a backend token to load your library.',
    tone: 'neutral',
  });

  /*
   * Normalize library tracks.
   */
  const normalizedLibraryTracks = useMemo(
    () =>
      libraryTracks.map(normalizeTrack),
    [libraryTracks],
  );

  /*
   * Featured tracks.
   */
  const featuredTracks = useMemo(
    () =>
      normalizedLibraryTracks.slice(0, 8),
    [normalizedLibraryTracks],
  );

  /*
   * Recently added tracks.
   */
  const recentlyAddedTracks = useMemo(
    () =>
      normalizedLibraryTracks
        .slice(-6)
        .reverse(),
    [normalizedLibraryTracks],
  );

  /*
   * Search/filter library.
   */
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

  /*
   * Apply library data.
   *
   * IMPORTANT:
   *
   * Do not replace an existing `tracks` queue
   * during a normal library refresh.
   *
   * Replacing the queue can change the active
   * track/index while audio is playing.
   */
  const applyLibraryTracks = useCallback(
    (nextTracks) => {
      if (!Array.isArray(nextTracks)) {
        return;
      }

      /*
       * Empty library.
       */
      if (nextTracks.length === 0) {
        setLibraryTracks([]);

        /*
         * Do NOT destroy an existing playback queue.
         *
         * If music is already playing, keep `tracks`
         * untouched.
         */
        setTracks((currentTracks) => {
          if (currentTracks.length > 0) {
            return currentTracks;
          }

          return [];
        });

        setActiveIndex((currentIndex) => {
          return currentIndex;
        });

        setApiState({
          label: 'Library empty',
          detail:
            'Backend is reachable, but no playable tracks were returned.',
          tone: 'warning',
        });

        return;
      }

      /*
       * Update library data.
       */
      setLibraryTracks(nextTracks);

      /*
       * IMPORTANT:
       *
       * Only initialize the playback queue when
       * it is currently empty.
       *
       * If the player already has tracks, don't
       * replace them during a refresh.
       */
      setTracks((currentTracks) => {
        if (currentTracks.length > 0) {
          return currentTracks;
        }

        return nextTracks;
      });

      /*
       * Keep current active index.
       *
       * The player controls the active index.
       */
      setActiveIndex(
        (currentIndex) => currentIndex,
      );

      setApiState({
        label: 'Library connected',
        detail: `${nextTracks.length} playable tracks loaded.`,
        tone: 'success',
      });
    },
    [],
  );

  /*
   * Refresh library from backend.
   */
  const refreshLibrary = useCallback(
    async (signal) => {
      const nextTracks =
        await tracksApi.getAll(
          token,
          signal,
        );

      applyLibraryTracks(nextTracks);

      return nextTracks;
    },
    [
      applyLibraryTracks,
      token,
    ],
  );

  /*
   * Load library when authentication is ready.
   */
  useEffect(() => {
    /*
     * Not authenticated.
     */
    if (!authReady) {
      setTracks([]);
      setLibraryTracks([]);
      setActiveIndex(0);

      setApiState({
        label: 'Not connected',
        detail:
          'Apply a backend token to load your library.',
        tone: 'neutral',
      });

      return undefined;
    }

    const controller =
      new AbortController();

    setIsLoadingLibrary(true);
    setDataError('');

    setApiState({
      label: 'Connecting',
      detail:
        'Loading tracks from the backend.',
      tone: 'neutral',
    });

    refreshLibrary(controller.signal)
      .catch((error) => {
        /*
         * Ignore cancelled requests.
         */
        if (
          error?.name === 'AbortError'
        ) {
          return;
        }

        /*
         * Invalid/expired token.
         */
        if (error?.status === 401) {
          clearSession();
          return;
        }

        /*
         * Keep current playback queue on
         * network/API failure.
         */
        setTracks(
          (currentTracks) =>
            currentTracks,
        );

        setLibraryTracks(
          (currentLibrary) =>
            currentLibrary,
        );

        setActiveIndex(
          (currentIndex) =>
            currentIndex,
        );

        setDataError(
          error?.message ||
            'Unable to load library.',
        );

        setApiState({
          label: 'Library unavailable',
          detail:
            error?.message ||
            'Unable to load library.',
          tone: 'warning',
        });
      })
      .finally(() => {
        setIsLoadingLibrary(false);
      });

    /*
     * Cancel request when the component
     * unmounts or authentication changes.
     */
    return () => {
      controller.abort();
    };
  }, [
    token,
    authReady,
    clearSession,
    refreshLibrary,
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