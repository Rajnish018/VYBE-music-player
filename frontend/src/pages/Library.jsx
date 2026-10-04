import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import Icon from '../components/Icons';
import TrackList from '../components/TrackList';
import PageHeader from '../components/PageHeader';

const TRACKS_PER_LOAD = 20;

function Library({
  tracks = [],
  query,
  onQueryChange,
  activeTrack,
  isPlaying,
  favoriteIds,
  onSelectTrack,
  onToggleFavorite,
  token,
}) {
  const [visibleCount, setVisibleCount] =
    useState(TRACKS_PER_LOAD);

  const loadMoreRef = useRef(null);

  /*
   * =========================
   * FILTER TRACKS
   * =========================
   */

  const filteredTracks = useMemo(() => {
    const search = query
      .trim()
      .toLowerCase();

    if (!search) {
      return tracks;
    }

    return tracks.filter((track) => {
      const text = [
        track?.title,
        track?.artist,
        track?.album,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return text.includes(search);
    });
  }, [tracks, query]);

  /*
   * =========================
   * VISIBLE TRACKS
   * =========================
   *
   * Only this number of tracks
   * is passed to TrackList.
   */

  const visibleTracks = useMemo(() => {
    return filteredTracks.slice(
      0,
      visibleCount,
    );
  }, [
    filteredTracks,
    visibleCount,
  ]);

  /*
   * =========================
   * CHECK FOR MORE
   * =========================
   */

  const hasMore =
    visibleCount <
    filteredTracks.length;

  /*
   * =========================
   * LOAD NEXT BATCH
   * =========================
   */

  const loadMore = useCallback(() => {
    if (!hasMore) {
      return;
    }

    setVisibleCount((current) =>
      Math.min(
        current + TRACKS_PER_LOAD,
        filteredTracks.length,
      ),
    );
  }, [
    hasMore,
    filteredTracks.length,
  ]);

  /*
   * =========================
   * INFINITE SCROLL
   * =========================
   */

  useEffect(() => {
    const element =
      loadMoreRef.current;

    if (!element || !hasMore) {
      return;
    }

    const observer =
      new IntersectionObserver(
        (entries) => {
          const entry = entries[0];

          if (entry?.isIntersecting) {
            loadMore();
          }
        },
        {
          root: null,

          /*
           * Start loading before
           * reaching the absolute bottom.
           */
          rootMargin: '500px',

          threshold: 0,
        },
      );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [
    loadMore,
    hasMore,
  ]);

  /*
   * =========================
   * RESET WHEN SEARCH CHANGES
   * =========================
   */

  useEffect(() => {
    setVisibleCount(
      TRACKS_PER_LOAD,
    );
  }, [query]);

  /*
   * =========================
   * RESET WHEN TRACK DATA
   * CHANGES
   * =========================
   */

  useEffect(() => {
    setVisibleCount(
      TRACKS_PER_LOAD,
    );
  }, [tracks]);

  return (
    <>
      {/* =========================
          PAGE HEADER
      ========================= */}

      <PageHeader
        eyebrow="Library"
        title="All saved music"
        description="Browse your entire music collection."
        right={
          <span className="page-header-count">
            <strong>
              {filteredTracks.length}
            </strong>
            &nbsp;
            {filteredTracks.length === 1
              ? 'track'
              : 'tracks'}
          </span>
        }
      />

      {/* =========================
          LIBRARY HEADER
      ========================= */}

      <section className="library-header">
        <div>
          <h2>Tracks</h2>

          <p>
            Showing{' '}
            {filteredTracks.length}
            {' matching tracks'}
          </p>
        </div>

        <label className="search-box">
          <Icon name="search" />

          <input
            type="search"
            placeholder="Search title, artist, or album"
            value={query}
            onChange={(event) =>
              onQueryChange(
                event.target.value,
              )
            }
            aria-label="Search title, artist, or album"
          />
        </label>
      </section>

      {/* =========================
          TRACK LIST
      ========================= */}

      <TrackList
        tracks={visibleTracks}
        queueTracks={visibleTracks}
        activeTrack={activeTrack}
        isPlaying={isPlaying}
        favoriteIds={favoriteIds}
        onSelectTrack={onSelectTrack}
        onToggleFavorite={
          onToggleFavorite
        }
        token={token}
        emptyTitle={
          query
            ? 'No matching tracks'
            : 'Your library is empty'
        }
        emptyCopy={
          query
            ? 'Try a different title or artist.'
            : 'Upload an audio file from the admin panel to start listening.'
        }
      />

      {/* =========================
          LOAD MORE
      ========================= */}

      {hasMore && (
        <div
          ref={loadMoreRef}
          className="library-load-more"
          aria-hidden="true"
        >
          <span className="library-loader" />

          <span>
            Loading more tracks...
          </span>
        </div>
      )}

      {/* =========================
          END
      ========================= */}

      {!hasMore &&
        filteredTracks.length >
          TRACKS_PER_LOAD && (
          <div className="library-load-end">
            All {filteredTracks.length}{' '}
            tracks loaded
          </div>
        )}
    </>
  );
}

export default Library;