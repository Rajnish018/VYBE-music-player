import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Icon from '../../components/Icons';
import CoverImage from '../../components/CoverImage';
import EditSong from './EditSong';
import PageHeader from '../../components/PageHeader';

import './ManageSongs.css';

const SONGS_PER_LOAD = 20;

function formatDuration(seconds) {
  if (
    seconds === '' ||
    seconds === null ||
    seconds === undefined
  ) {
    return '';
  }

  const value = Number(seconds);

  if (!Number.isFinite(value) || value < 0) {
    return '—';
  }

  const totalSeconds = Math.round(value);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(
    2,
    '0',
  )}`;
}

async function getErrorMessage(response, fallback) {
  try {
    const body = await response.json();

    return (
      body?.message ||
      body?.error ||
      fallback
    );
  } catch {
    return fallback;
  }
}

function ManageSongs({
  tracks = [],
  token,
  onTracksChange,
}) {
  const [selectedId, setSelectedId] =
    useState(null);

  const [query, setQuery] = useState('');

  const [deleting, setDeleting] =
    useState(false);

  const [visibleCount, setVisibleCount] =
    useState(SONGS_PER_LOAD);

  const loadMoreRef = useRef(null);

  /*
   * =========================
   * SEARCH
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
   * VISIBLE SONGS
   * =========================
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
   * CHECK MORE
   * =========================
   */

  const hasMore =
    visibleCount <
    filteredTracks.length;

  /*
   * =========================
   * LOAD MORE
   * =========================
   */

  const loadMore = useCallback(() => {
    if (!hasMore) {
      return;
    }

    setVisibleCount((current) =>
      Math.min(
        current + SONGS_PER_LOAD,
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
          const firstEntry =
            entries[0];

          if (
            firstEntry.isIntersecting
          ) {
            loadMore();
          }
        },
        {
          root: null,

          /*
           * Start loading before the
           * user reaches the absolute
           * bottom of the page.
           */
          rootMargin: '500px',

          threshold: 0,
        },
      );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [loadMore, hasMore]);

  /*
   * =========================
   * RESET ON SEARCH
   * =========================
   */

  useEffect(() => {
    setVisibleCount(
      SONGS_PER_LOAD,
    );
  }, [query]);

  /*
   * =========================
   * RESET WHEN TRACK DATA CHANGES
   * =========================
   */

  useEffect(() => {
    setVisibleCount(
      SONGS_PER_LOAD,
    );
  }, [tracks]);

  /*
   * =========================
   * SELECTED TRACK
   * =========================
   */

  const selectedTrack = useMemo(
    () =>
      tracks.find(
        (track) =>
          track.id === selectedId,
      ) || null,
    [tracks, selectedId],
  );

  /*
   * =========================
   * DELETE SONG
   * =========================
   */

  async function deleteSong(track) {
    if (!track?.id || deleting) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${
        track.title || 'this song'
      }" permanently?\n\nThis will remove the audio, artwork, and database record.`,
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);

    try {
      const response = await fetch(
        `/api/admin/tracks/${track.id}`,
        {
          method: 'DELETE',

          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.status === 401) {
        throw new Error(
          'Your session has expired.',
        );
      }

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(
            response,
            'Unable to delete song.',
          ),
        );
      }

      onTracksChange?.((current) =>
        current.filter(
          (item) =>
            item.id !== track.id,
        ),
      );

      if (
        selectedId === track.id
      ) {
        setSelectedId(null);
      }
    } catch (error) {
      window.alert(
        error?.message ||
          'Unable to delete song.',
      );
    } finally {
      setDeleting(false);
    }
  }

  /*
   * =========================
   * EDIT
   * =========================
   */

  function openEditor(id) {
    setSelectedId(id);
  }

  function backToLibrary() {
    setSelectedId(null);
  }

  /*
   * =========================
   * EDIT SONG SCREEN
   * =========================
   */

  if (selectedTrack) {
    return (
      <section className="manage-songs-page">
        <EditSong
          track={selectedTrack}
          token={token}
          onTracksChange={
            onTracksChange
          }
          onBack={backToLibrary}
        />
      </section>
    );
  }

  /*
   * =========================
   * MAIN PAGE
   * =========================
   */

  return (
    <section className="manage-songs-page">

      {/* =========================
          HEADER
      ========================= */}

      <header className="manage-songs-header">
        <div>
          <p className="eyebrow">
            Administrator
          </p>

          <h1>
            Manage Songs
          </h1>

          <p className="manage-songs-subtitle">
            Manage metadata, artwork, audio
            files, and your complete music
            library.
          </p>
        </div>

        <div className="manage-songs-count">
          <strong>
            {tracks.length}
          </strong>

          <span>
            songs
          </span>
        </div>
      </header>

      {/* =========================
          TOOLBAR
      ========================= */}

      <div className="library-toolbar">

        <div>
          <span className="section-kicker">
            Library
          </span>

          <h2>
            All Songs
          </h2>

          <p>
            Select a song to open the editor.
          </p>
        </div>

        <div className="library-toolbar-right">

          <span className="songs-total large">
            {filteredTracks.length}
            {' / '}
            {tracks.length}
          </span>

          <div className="song-search">
            <Icon name="search" />

            <input
              type="search"
              value={query}
              onChange={(event) =>
                setQuery(
                  event.target.value,
                )
              }
              placeholder="Search songs..."
              aria-label="Search songs"
            />
          </div>

        </div>
      </div>

      {/* =========================
          EMPTY STATE
      ========================= */}

      {filteredTracks.length === 0 ? (
        <div className="library-empty">

          <div className="empty-icon">
            <Icon name="music" />
          </div>

          <h3>
            {tracks.length === 0
              ? 'No songs yet'
              : 'No songs found'}
          </h3>

          <p>
            {tracks.length === 0
              ? 'Upload songs from the Admin Dashboard.'
              : 'Try another search.'}
          </p>

        </div>
      ) : (
        <>
          {/* =========================
              SONG GRID
          ========================= */}

          <div className="songs-library-grid">

            {visibleTracks.map(
              (track) => (
                <article
                  key={track.id}
                  className="song-library-card"
                >

                  {/* COVER */}

                  <div className="song-library-cover">

                    {track.thumbnailUrl ? (
                      <CoverImage
                        src={
                          track.thumbnailUrl
                        }
                        token={token}
                      />
                    ) : (
                      <div className="song-cover-placeholder">
                        <Icon name="music" />
                      </div>
                    )}

                    {/* ACTIONS */}

                    <div className="song-library-overlay">

                      <button
                        type="button"
                        className="song-card-action edit"
                        onClick={() =>
                          openEditor(
                            track.id,
                          )
                        }
                      >
                        <span>
                          ✎
                        </span>

                        Edit
                      </button>

                      <button
                        type="button"
                        className="song-card-action delete"
                        onClick={() =>
                          deleteSong(
                            track,
                          )
                        }
                        disabled={deleting}
                      >
                        <span>
                          ×
                        </span>

                        Delete
                      </button>

                    </div>
                  </div>

                  {/* INFO */}

                  <div className="song-library-info">

                    <div className="song-title-row">

                      <h3>
                        {track.title ||
                          'Untitled'}
                      </h3>

                      {track.explicit ? (
                        <span className="explicit-badge">
                          E
                        </span>
                      ) : null}

                    </div>

                    <p>
                      {track.artist ||
                        'Unknown Artist'}
                    </p>

                    <div className="song-library-meta">

                      <span>
                        {track.album ||
                          'Single'}
                      </span>

                      <span>
                        {formatDuration(
                          track.duration,
                        )}
                      </span>

                    </div>

                  </div>

                </article>
              ),
            )}

          </div>

          {/* =========================
              LOAD MORE SENTINEL
          ========================= */}

          {hasMore && (
            <div
              ref={loadMoreRef}
              className="songs-load-more"
              aria-hidden="true"
            >
              <span className="songs-loader" />

              <span>
                Loading more songs...
              </span>
            </div>
          )}

          {/* =========================
              ALL LOADED
          ========================= */}

          {!hasMore &&
            filteredTracks.length >
              SONGS_PER_LOAD && (
              <div className="songs-load-end">
                <span>
                  All{' '}
                  {
                    filteredTracks.length
                  }{' '}
                  songs loaded
                </span>
              </div>
            )}

        </>
      )}

    </section>
  );
}

export default ManageSongs;