import { create } from 'zustand';

import {
  authApi,
  favoritesApi,
  tracksApi,
} from '../api';

import {
  clearStoredSession,
  STORAGE_TOKEN_KEY,
  STORAGE_USER_KEY,
} from '../handlers/authHandlers';

const DEFAULT_API_STATE = {
  label: 'Not connected',
  detail: 'Apply a backend token to load your library.',
  tone: 'neutral',
};

let initializationPromise = null;

function readStoredToken() {
  try {
    return (
      localStorage.getItem(STORAGE_TOKEN_KEY) ||
      ''
    );
  } catch {
    return '';
  }
}

function readStoredUser() {
  try {
    return JSON.parse(
      localStorage.getItem(STORAGE_USER_KEY) ||
        'null',
    );
  } catch {
    return null;
  }
}

function writeStoredSession(token, user) {
  try {
    localStorage.setItem(
      STORAGE_TOKEN_KEY,
      token,
    );

    localStorage.setItem(
      STORAGE_USER_KEY,
      JSON.stringify(user),
    );
  } catch {
    // Ignore localStorage errors.
  }
}

function createFavoriteIds(favoriteTracks) {
  return new Set(
    (Array.isArray(favoriteTracks)
      ? favoriteTracks
      : []
    )
      .map((track) => track?.id)
      .filter(Boolean),
  );
}

function applyLibraryTracksState(
  state,
  nextTracks,
) {
  const safeTracks = Array.isArray(nextTracks)
    ? nextTracks
    : [];

  if (safeTracks.length === 0) {
    return {
      libraryTracks: [],
      tracks:
        state.tracks.length > 0
          ? state.tracks
          : [],
      activeIndex: state.activeIndex,
      apiState: {
        label: 'Library empty',
        detail:
          'Backend is reachable, but no playable tracks were returned.',
        tone: 'warning',
      },
    };
  }

  return {
    libraryTracks: safeTracks,
    tracks:
      state.tracks.length > 0
        ? state.tracks
        : safeTracks,
    activeIndex: state.activeIndex,
    apiState: {
      label: 'Library connected',
      detail: `${safeTracks.length} playable tracks loaded.`,
      tone: 'success',
    },
  };
}

function replaceTrack(list, updatedTrack) {
  if (!updatedTrack?.id) {
    return list;
  }

  return list.map((track) =>
    track.id === updatedTrack.id
      ? {
          ...track,
          ...updatedTrack,
        }
      : track,
  );
}

function addTrackToList(list, track) {
  if (!track?.id) {
    return list;
  }

  if (
    list.some(
      (current) => current.id === track.id,
    )
  ) {
    return replaceTrack(list, track);
  }

  return [...list, track];
}

export const useAppStore = create(
  (set, get) => ({
    token: readStoredToken(),

    user: readStoredUser(),

    sessionState: readStoredToken()
      ? 'checking'
      : 'anonymous',

    authLoading: false,

    authError: '',

    /*
     * tracks
     *
     * Global/discovery collection.
     *
     * This can contain tracks returned by:
     * - global library
     * - search
     * - YouTube
     * - other discovery sources
     */
    tracks: [],

    /*
     * libraryTracks
     *
     * Personal user library.
     *
     * Only tracks explicitly saved by the
     * authenticated user should appear here.
     */
    libraryTracks: [],

    activeIndex: 0,

    isLoadingLibrary: false,

    dataError: '',

    query: '',

    apiState: DEFAULT_API_STATE,

    favoriteTracks: [],

    favoriteIds: new Set(),

    favoritesLoading: false,

    favoritesError: '',

    pendingFavoriteTrackIds: new Set(),

    initialized: false,

    initializing: false,

    initializationError: '',

    setToken(token) {
      set({
        token,
      });
    },

    setUser(user) {
      set({
        user,
      });
    },

    setSessionState(sessionState) {
      set({
        sessionState,
      });
    },

    setAuthLoading(authLoading) {
      set({
        authLoading,
      });
    },

    setAuthError(authError) {
      set({
        authError,
      });
    },

    setQuery(query) {
      set({
        query,
      });
    },

    setActiveIndex(activeIndex) {
      set({
        activeIndex,
      });
    },

    /*
     * Replace/update the global tracks collection.
     *
     * IMPORTANT:
     * This does NOT automatically modify libraryTracks.
     *
     * A global/discovery track is not automatically
     * considered saved to the user's library.
     */
    setTracks(nextTracks) {
      if (typeof nextTracks === 'function') {
        set((state) => ({
          tracks: nextTracks(state.tracks),
        }));

        return;
      }

      set({
        tracks: Array.isArray(nextTracks)
          ? nextTracks
          : [],
      });
    },

    /*
     * Existing generic collection updater.
     *
     * Kept for existing favorite/library workflows.
     */
    updateTrackCollections(updater) {
      if (typeof updater !== 'function') {
        return;
      }

      set((state) => {
        const nextLibraryTracks =
          updater(
            state.libraryTracks,
          );

        const nextTracks =
          updater(
            state.tracks,
          );

        const nextFavoriteTracks =
          updater(
            state.favoriteTracks,
          );

        const safeFavoriteTracks =
          Array.isArray(nextFavoriteTracks)
            ? nextFavoriteTracks
            : state.favoriteTracks;

        return {
          libraryTracks:
            Array.isArray(nextLibraryTracks)
              ? nextLibraryTracks
              : state.libraryTracks,

          tracks:
            Array.isArray(nextTracks)
              ? nextTracks
              : state.tracks,

          favoriteTracks:
            safeFavoriteTracks,

          favoriteIds:
            createFavoriteIds(
              safeFavoriteTracks,
            ),
        };
      });
    },

    /*
     * Replace favorites.
     */
    setFavoriteTracks(
      nextFavoriteTracks,
    ) {
      if (
        typeof nextFavoriteTracks ===
        'function'
      ) {
        set((state) => {
          const favoriteTracks =
            nextFavoriteTracks(
              state.favoriteTracks,
            );

          return {
            favoriteTracks,

            favoriteIds:
              createFavoriteIds(
                favoriteTracks,
              ),
          };
        });

        return;
      }

      const favoriteTracks =
        Array.isArray(
          nextFavoriteTracks,
        )
          ? nextFavoriteTracks
          : [];

      set({
        favoriteTracks,

        favoriteIds:
          createFavoriteIds(
            favoriteTracks,
          ),
      });
    },

    /*
     * Apply a complete personal library.
     *
     * This should be used with:
     * GET /api/tracks/library
     */
    applyLibraryTracks(
      nextTracks,
    ) {
      set((state) =>
        applyLibraryTracksState(
          state,
          nextTracks,
        ),
      );
    },

    /*
     * Add a track to the personal library
     * without refreshing the page.
     *
     * IMPORTANT:
     * This intentionally does NOT touch
     * favoriteTracks or favoriteIds.
     */
    addTrackToLibrary(track) {
      if (!track?.id) {
        return;
      }

      set((state) => {
        const nextLibraryTracks =
          addTrackToList(
            state.libraryTracks,
            track,
          );

        /*
         * Keep the global track collection in sync
         * when this exact track already exists there.
         *
         * If it doesn't exist, add it as well so
         * Player/search-related consumers can use
         * the returned saved track immediately.
         */
        const nextTracks =
          addTrackToList(
            state.tracks,
            track,
          );

        return {
          libraryTracks:
            nextLibraryTracks,

          tracks:
            nextTracks,

          apiState: {
            label: 'Library connected',
            detail: `${nextLibraryTracks.length} playable tracks loaded.`,
            tone: 'success',
          },
        };
      });
    },

    /*
     * Add a track to both global tracks and
     * personal library.
     *
     * Existing behavior kept for compatibility.
     */
    addTrack(track) {
      if (!track?.id) {
        return;
      }

      set((state) => {
        const nextLibraryTracks =
          addTrackToList(
            state.libraryTracks,
            track,
          );

        return {
          tracks:
            addTrackToList(
              state.tracks,
              track,
            ),

          libraryTracks:
            nextLibraryTracks,

          apiState: {
            label: 'Library connected',
            detail: `${nextLibraryTracks.length} playable tracks loaded.`,
            tone: 'success',
          },
        };
      });
    },

    /*
     * Update an existing track everywhere
     * where it already exists.
     */
    updateTrack(updatedTrack) {
      if (!updatedTrack?.id) {
        return;
      }

      set((state) => ({
        tracks:
          replaceTrack(
            state.tracks,
            updatedTrack,
          ),

        libraryTracks:
          replaceTrack(
            state.libraryTracks,
            updatedTrack,
          ),

        favoriteTracks:
          replaceTrack(
            state.favoriteTracks,
            updatedTrack,
          ),
      }));
    },

    /*
     * Remove a track from all local collections.
     */
    removeTrack(trackId) {
      set((state) => {
        const nextFavorites =
          state.favoriteTracks.filter(
            (track) =>
              track.id !== trackId,
          );

        return {
          tracks:
            state.tracks.filter(
              (track) =>
                track.id !== trackId,
            ),

          libraryTracks:
            state.libraryTracks.filter(
              (track) =>
                track.id !== trackId,
            ),

          favoriteTracks:
            nextFavorites,

          favoriteIds:
            createFavoriteIds(
              nextFavorites,
            ),

          activeIndex:
            Math.min(
              state.activeIndex,
              Math.max(
                state.tracks.length - 2,
                0,
              ),
            ),
        };
      });
    },

    /*
     * Clear authentication and all
     * user-specific application state.
     */
    clearSessionState() {
      clearStoredSession();

      initializationPromise = null;

      set({
        token: '',

        user: null,

        sessionState: 'anonymous',

        authLoading: false,

        authError: '',

        tracks: [],

        libraryTracks: [],

        activeIndex: 0,

        isLoadingLibrary: false,

        dataError: '',

        apiState:
          DEFAULT_API_STATE,

        favoriteTracks: [],

        favoriteIds: new Set(),

        favoritesLoading: false,

        favoritesError: '',

        pendingFavoriteTrackIds:
          new Set(),

        initialized: true,

        initializing: false,

        initializationError: '',
      });
    },

    /*
     * Load protected application data.
     *
     * IMPORTANT:
     *
     * tracksApi.getLibrary(token)
     * returns ONLY the authenticated user's
     * saved library.
     *
     * It must NOT be replaced with
     * tracksApi.getAll(token).
     */
    async loadProtectedData(
      token = get().token,
      {
        clearOnUnauthorized = true,
      } = {},
    ) {
      if (!token) {
        return {
          tracks: [],
          favorites: [],
        };
      }

      set({
        isLoadingLibrary: true,

        favoritesLoading: true,

        dataError: '',

        favoritesError: '',

        apiState: {
          label: 'Connecting',

          detail:
            'Loading tracks from the backend.',

          tone: 'neutral',
        },
      });

      try {
        /*
         * Load the PERSONAL library and
         * favorites independently.
         *
         * Do not use getAll() here.
         */
        const [
          tracks,
          favoriteTracks,
        ] = await Promise.all([
          tracksApi.getLibrary(
            token,
          ),

          favoritesApi.getAll(
            token,
          ),
        ]);

        set((state) => ({
          ...applyLibraryTracksState(
            state,
            tracks,
          ),

          /*
           * The returned tracks are the
           * authenticated user's library.
           */
          libraryTracks:
            Array.isArray(tracks)
              ? tracks
              : [],

          favoriteTracks:
            Array.isArray(
              favoriteTracks,
            )
              ? favoriteTracks
              : [],

          favoriteIds:
            createFavoriteIds(
              favoriteTracks,
            ),

          isLoadingLibrary: false,

          favoritesLoading: false,

          dataError: '',

          favoritesError: '',
        }));

        return {
          tracks,

          favorites:
            favoriteTracks,
        };
      } catch (error) {
        if (
          error?.status === 401 &&
          clearOnUnauthorized
        ) {
          get().clearSessionState();

          return {
            tracks: [],
            favorites: [],
          };
        }

        set({
          isLoadingLibrary: false,

          favoritesLoading: false,

          dataError:
            error?.message ||
            'Unable to load library.',

          favoritesError:
            error?.message ||
            'Unable to load favorites.',

          apiState: {
            label:
              'Library unavailable',

            detail:
              error?.message ||
              'Unable to load library.',

            tone: 'warning',
          },
        });

        throw error;
      }
    },

    /*
     * Refresh ONLY the authenticated user's
     * personal library.
     *
     * IMPORTANT:
     * Do not use tracksApi.getAll() here.
     */
    async refreshLibrary(signal) {
      const { token } = get();

      if (!token) {
        return [];
      }

      set({
        isLoadingLibrary: true,

        dataError: '',
      });

      try {
        const nextTracks =
          await tracksApi.getLibrary(
            token,
            signal,
          );

        set((state) => ({
          ...applyLibraryTracksState(
            state,
            nextTracks,
          ),

          /*
           * Explicitly keep this collection
           * user-specific.
           */
          libraryTracks:
            Array.isArray(
              nextTracks,
            )
              ? nextTracks
              : [],

          isLoadingLibrary: false,

          dataError: '',
        }));

        return nextTracks;
      } catch (error) {
        set({
          isLoadingLibrary: false,

          dataError:
            error?.message ||
            'Unable to load library.',

          apiState: {
            label:
              'Library unavailable',

            detail:
              error?.message ||
              'Unable to load library.',

            tone: 'warning',
          },
        });

        throw error;
      }
    },

    /*
     * Initialize application state.
     */
    async initializeApp() {
      if (get().initialized) {
        return get();
      }

      if (initializationPromise) {
        return initializationPromise;
      }

      initializationPromise =
        (async () => {
          const token =
            get().token ||
            readStoredToken();

          set({
            initialized: false,

            initializing: true,

            initializationError: '',

            sessionState: token
              ? 'checking'
              : 'anonymous',
          });

          if (!token) {
            set({
              token: '',

              user: null,

              sessionState:
                'anonymous',

              initialized: true,

              initializing: false,
            });

            return get();
          }

          try {
            const [
              authResult,
              dataResult,
            ] = await Promise.allSettled([
              authApi.me(token),

              get().loadProtectedData(
                token,
                {
                  clearOnUnauthorized:
                    false,
                },
              ),
            ]);

            if (
              authResult.status ===
              'rejected'
            ) {
              if (
                authResult.reason
                  ?.status === 401
              ) {
                get().clearSessionState();

                return get();
              }

              throw authResult.reason;
            }

            const currentUser =
              authResult.value
                ?.user;

            if (!currentUser) {
              get().clearSessionState();

              return get();
            }

            writeStoredSession(
              token,
              currentUser,
            );

            set({
              token,

              user: currentUser,

              sessionState:
                'authenticated',
            });

            if (
              dataResult.status ===
              'rejected'
            ) {
              if (
                dataResult.reason
                  ?.status === 401
              ) {
                get().clearSessionState();

                return get();
              }

              set({
                initializationError:
                  dataResult.reason
                    ?.message ||
                  'Unable to initialize app data.',
              });
            }

            set({
              initialized: true,

              initializing: false,
            });

            return get();
          } catch (error) {
            set({
              user: null,

              sessionState:
                'anonymous',

              initialized: true,

              initializing: false,

              initializationError:
                error?.message ||
                'Unable to initialize app.',
            });

            return get();
          } finally {
            initializationPromise =
              null;
          }
        })();

      return initializationPromise;
    },

    /*
     * Login / registration.
     */
    async authenticate({
      authMode,
      authForm,
    }) {
      set({
        authLoading: true,

        authError: '',
      });

      try {
        const data =
          await (
            authMode === 'login'
              ? authApi.login(
                  authForm,
                )
              : authApi.register(
                  authForm,
                )
          );

        writeStoredSession(
          data.token,
          data.user,
        );

        set({
          token: data.token,

          user: data.user,

          sessionState:
            'authenticated',

          initialized: true,

          initializing: false,
        });

        await get().loadProtectedData(
          data.token,
        );

        return data;
      } catch (error) {
        set({
          authError:
            error?.message ||
            'Authentication failed.',
        });

        throw error;
      } finally {
        set({
          authLoading: false,
        });
      }
    },
  }),
);