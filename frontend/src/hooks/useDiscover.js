import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { tracksApi } from '../api';
import { normalizeTrack } from '../utils/track';

const SEARCH_DEBOUNCE_MS = 650;

export function useDiscover({
  token,
  authReady,
  view,
  clearSession,
}) {
  /*
   * Cache search results.
   *
   * key:
   * source:query
   */
  const discoverCacheRef = useRef(
    new Map(),
  );

  /*
   * Track the latest request.
   *
   * Prevents an old request from updating
   * loading/results after a newer request starts.
   */
  const requestIdRef = useRef(0);

  const [
    discoverQuery,
    setDiscoverQuery,
  ] = useState('');

  const [
    debouncedQuery,
    setDebouncedQuery,
  ] = useState('');

  const [
    discoverSource,
    setDiscoverSource,
  ] = useState('library');

  const [
    discoverResults,
    setDiscoverResults,
  ] = useState([]);

  const [
    discoverLoading,
    setDiscoverLoading,
  ] = useState(false);

  const [
    discoverError,
    setDiscoverError,
  ] = useState('');

  /*
   * Normalize results only when results change.
   */
  const normalizedDiscoverResults =
    useMemo(
      () =>
        discoverResults.map(
          normalizeTrack,
        ),
      [discoverResults],
    );

  /*
   * DEBOUNCE SEARCH INPUT
   *
   * User can type freely without making
   * an API request for every character.
   */
  useEffect(() => {
    const timeoutId =
      window.setTimeout(() => {
        setDebouncedQuery(
          discoverQuery,
        );
      }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [discoverQuery]);

  /*
   * SEARCH API
   */
  useEffect(() => {
    /*
     * Don't search when:
     * - authentication isn't ready
     * - user isn't on Discover page
     */
    if (
      !authReady ||
      view !== 'discover'
    ) {
      setDiscoverLoading(false);
      return undefined;
    }

    const cleanQuery =
      debouncedQuery.trim();

    /*
     * Require at least 3 characters.
     */
    if (cleanQuery.length < 3) {
      setDiscoverResults([]);
      setDiscoverError('');
      setDiscoverLoading(false);

      return undefined;
    }

    /*
     * Create cache key.
     */
    const cacheKey =
      `${discoverSource}:${cleanQuery.toLowerCase()}`;

    /*
     * Check cache first.
     */
    const cachedResults =
      discoverCacheRef.current.get(
        cacheKey,
      );

    if (cachedResults) {
      setDiscoverResults(
        cachedResults,
      );
      setDiscoverError('');
      setDiscoverLoading(false);

      return undefined;
    }

    /*
     * New request ID.
     */
    const requestId =
      ++requestIdRef.current;

    /*
     * Abort controller for this request.
     */
    const controller =
      new AbortController();

    setDiscoverLoading(true);
    setDiscoverError('');

    const source =
      discoverSource === 'youtube'
        ? 'youtube'
        : '';

    tracksApi
      .search(
        cleanQuery,
        token,
        controller.signal,
        source,
      )
      .then((results) => {
        /*
         * Ignore results from an old request.
         */
        if (
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        /*
         * Save to cache.
         */
        discoverCacheRef.current.set(
          cacheKey,
          results,
        );

        /*
         * Update current results.
         */
        setDiscoverResults(
          results,
        );
      })
      .catch((error) => {
        /*
         * Ignore aborted requests.
         */
        if (
          error?.name ===
          'AbortError'
        ) {
          return;
        }

        /*
         * Ignore stale requests.
         */
        if (
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        /*
         * Authentication expired.
         */
        if (error?.status === 401) {
          clearSession();
          return;
        }

        setDiscoverResults([]);
        setDiscoverError(
          error?.message ||
            'Search failed.',
        );
      })
      .finally(() => {
        /*
         * Only the latest request can
         * change loading state.
         */
        if (
          requestId ===
          requestIdRef.current
        ) {
          setDiscoverLoading(false);
        }
      });

    /*
     * Abort request when:
     *
     * - query changes
     * - source changes
     * - page changes
     * - token changes
     * - component unmounts
     */
    return () => {
      controller.abort();
    };
  }, [
    token,
    authReady,
    view,
    debouncedQuery,
    discoverSource,
    clearSession,
  ]);

  /*
   * Change search source.
   */
  const changeDiscoverSource =
    useCallback((nextSource) => {
      setDiscoverSource(
        nextSource,
      );

      setDiscoverResults([]);

      setDiscoverError('');
    }, []);

  /*
   * Clear search error.
   */
  const clearDiscoverError =
    useCallback(() => {
      setDiscoverError('');
    }, []);

  return {
    discoverQuery,

    discoverSource,

    discoverResults:
      normalizedDiscoverResults,

    discoverLoading,

    discoverError,

    setDiscoverQuery,

    setDiscoverSource:
      changeDiscoverSource,

    clearDiscoverError,
  };
}