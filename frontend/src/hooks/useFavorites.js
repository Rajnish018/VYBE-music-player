import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { favoritesApi } from '../api';
import { normalizeTrack } from '../utils/track';

export function useFavorites({
  token,
  authReady,
  clearSession,
}) {
  const [favoriteTracks, setFavoriteTracks] =
    useState([]);

  /*
   * Identifies the latest favorites request.
   * Prevents stale responses from older requests
   * from replacing newer state.
   */
  const requestIdRef = useRef(0);

  const safeFavoriteTracks = useMemo(
    () =>
      Array.isArray(favoriteTracks)
        ? favoriteTracks
        : [],
    [favoriteTracks],
  );

  /*
   * Fast O(1) favorite lookup.
   */
  const favoriteIds = useMemo(
    () =>
      new Set(
        safeFavoriteTracks
          .map((track) => track?.id)
          .filter(Boolean),
      ),
    [safeFavoriteTracks],
  );

  const normalizedFavoriteTracks =
    useMemo(
      () =>
        safeFavoriteTracks.map(
          normalizeTrack,
        ),
      [safeFavoriteTracks],
    );

  /*
   * INITIAL FAVORITES LOAD
   *
   * Runs when authentication becomes ready
   * for the current token.
   */
  useEffect(() => {
    if (!authReady || !token) {
      return undefined;
    }

    const controller =
      new AbortController();

    const requestId =
      ++requestIdRef.current;

    favoritesApi
      .getAll(
        token,
        controller.signal,
      )
      .then((tracks) => {
        /*
         * Ignore stale responses.
         */
        if (
          controller.signal.aborted ||
          requestId !==
            requestIdRef.current
        ) {
          return;
        }

        setFavoriteTracks(
          Array.isArray(tracks)
            ? tracks
            : [],
        );
      })
      .catch((error) => {
        if (
          controller.signal.aborted ||
          error?.name === 'AbortError'
        ) {
          return;
        }

        /*
         * Ignore errors from an old request.
         */
        if (
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        if (error?.status === 401) {
          clearSession();
          return;
        }

        /*
         * Keep the current state on a
         * non-authentication network error.
         *
         * This is preferable to making the
         * user's existing favorites disappear.
         */
      });

    return () => {
      controller.abort();
    };
  }, [
    token,
    authReady,
    clearSession,
  ]);

  return {
    favoriteTracks,
    setFavoriteTracks,
    favoriteIds,
    normalizedFavoriteTracks,
  };
}