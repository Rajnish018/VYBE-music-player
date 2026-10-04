import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icons';
import CoverImage from '../../components/CoverImage';
import './Albums.css';
import PageHeader from '../../components/PageHeader';

const ALBUMS_PER_LOAD = 20;

function normalizeAlbumName(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function getAlbumCover(albumTracks) {
  return (
    albumTracks.find(
      (track) => track?.thumbnailUrl
    )?.thumbnailUrl || ''
  );
}

function Albums({ tracks = [], token }) {
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] =
    useState(ALBUMS_PER_LOAD);

  const loadMoreRef = useRef(null);

  /*
   * Group songs into albums
   */
  const albums = useMemo(() => {
    const grouped = new Map();

    tracks.forEach((track) => {
      const rawAlbumName =
        typeof track?.album === 'string'
          ? track.album.trim()
          : '';

      const albumName =
        rawAlbumName || 'Unknown Album';

      const key =
        normalizeAlbumName(albumName);

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key).push(track);
    });

    return [...grouped.entries()]
      .map(([key, albumTracks]) => {
        const first = albumTracks[0];

        const albumName =
          typeof first?.album === 'string' &&
            first.album.trim()
            ? first.album.trim()
            : 'Unknown Album';

        const artists = [
          ...new Set(
            albumTracks
              .map((track) => {
                const artist =
                  typeof track?.artist === 'string'
                    ? track.artist.trim()
                    : '';

                const albumArtist =
                  typeof track?.albumArtist === 'string'
                    ? track.albumArtist.trim()
                    : '';

                return artist || albumArtist;
              })
              .filter(Boolean)
          ),
        ];

        const artistName =
          artists.length === 0
            ? 'Unknown Artist'
            : artists.length === 1
              ? artists[0]
              : 'Various Artists';

        const sortedTracks = [
          ...albumTracks,
        ].sort((a, b) => {
          const discA =
            Number(a?.discNumber) || 0;

          const discB =
            Number(b?.discNumber) || 0;

          const trackA =
            Number(a?.trackNumber) || 0;

          const trackB =
            Number(b?.trackNumber) || 0;

          return (
            discA - discB ||
            trackA - trackB ||
            String(a?.title || '').localeCompare(
              String(b?.title || '')
            )
          );
        });

        return {
          key,
          name: albumName,
          artist: artistName,
          year: first?.releaseYear || '',
          cover: getAlbumCover(sortedTracks),
          tracks: sortedTracks,
        };
      })
      .sort((a, b) =>
        a.name.localeCompare(
          b.name,
          undefined,
          {
            sensitivity: 'base',
          }
        )
      );
  }, [tracks]);

  /*
   * Search albums
   */
  const filteredAlbums = useMemo(() => {
    const clean =
      normalizeAlbumName(query);

    if (!clean) {
      return albums;
    }

    return albums.filter((album) =>
      normalizeAlbumName(
        `${album.name} ${album.artist} ${album.year}`
      ).includes(clean)
    );
  }, [albums, query]);

  /*
   * Albums currently displayed
   */
  const visibleAlbums = useMemo(() => {
    return filteredAlbums.slice(
      0,
      visibleCount
    );
  }, [
    filteredAlbums,
    visibleCount,
  ]);

  /*
   * Check whether more albums exist
   */
  const hasMore =
    visibleCount < filteredAlbums.length;

  /*
   * Load next batch
   */
  const loadMore = useCallback(() => {
    if (!hasMore) {
      return;
    }

    setVisibleCount((current) =>
      Math.min(
        current + ALBUMS_PER_LOAD,
        filteredAlbums.length
      )
    );
  }, [
    hasMore,
    filteredAlbums.length,
  ]);

  /*
   * Infinite scroll observer
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
          rootMargin: '500px',
          threshold: 0,
        }
      );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [loadMore, hasMore]);

  /*
   * Reset pagination when search changes
   */
  useEffect(() => {
    setVisibleCount(
      ALBUMS_PER_LOAD
    );
  }, [query]);

  /*
   * Reset pagination when track data changes
   */
  useEffect(() => {
    setVisibleCount(
      ALBUMS_PER_LOAD
    );
  }, [tracks]);

  /*
   * Open album
   */
  function openAlbum(album) {
    navigate(
      `/albums/${encodeURIComponent(
        album.key
      )}`
    );
  }

  return (
    <section className="albums-page">
      {/* =========================
          PAGE HEADER
      ========================= */}

      <PageHeader
        eyebrow="Library"
        title="Albums"
        description="Browse your music collection by album."
      />

      {/* =========================
          SEARCH
      ========================= */}

      <div className="albums-toolbar">
        <div className="album-search">
          <Icon name="search" />

          <input
            type="search"
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value
              )
            }
            placeholder="Search albums..."
            aria-label="Search albums"
          />
        </div>
      </div>

      {/* =========================
          EMPTY STATE
      ========================= */}

      {filteredAlbums.length === 0 ? (
        <div className="albums-empty">
          <Icon name="music" />

          <h2>No albums found</h2>

          <p>
            {query
              ? 'Try another album, artist, or year.'
              : 'Albums will appear here when your songs have album metadata.'}
          </p>
        </div>
      ) : (
        <>
          {/* =========================
              ALBUM GRID
          ========================= */}

          <div className="albums-grid">
            {visibleAlbums.map(
              (album) => (
                <button
                  type="button"
                  className="album-card"
                  key={album.key}
                  onClick={() =>
                    openAlbum(album)
                  }
                  aria-label={`Open album ${album.name}`}
                >
                  <div className="album-card-cover">
                    {album.cover ? (
                      <CoverImage
                        src={album.cover}
                        token={token}
                      />
                    ) : (
                      <div className="album-cover-placeholder">
                        <Icon name="music" />
                      </div>
                    )}

                    <span className="album-card-play">
                      <Icon name="play" />
                    </span>
                  </div>

                  <div className="album-card-info">
                    <strong
                      title={album.name}
                    >
                      {album.name}
                    </strong>

                    <span
                      title={album.artist}
                    >
                      {album.artist}
                    </span>

                    <small>
                      {album.year
                        ? `${album.year} · `
                        : ''}

                      {album.tracks.length}{' '}
                      {album.tracks.length ===
                        1
                        ? 'song'
                        : 'songs'}
                    </small>
                  </div>
                </button>
              )
            )}
          </div>

          {/* =========================
              LOAD MORE
          ========================= */}

          {hasMore && (
            <div
              ref={loadMoreRef}
              className="albums-load-more"
              aria-hidden="true"
            >
              <span className="albums-loader" />

              <span>
                Loading more albums...
              </span>
            </div>
          )}

          {/* =========================
              END
          ========================= */}

          {!hasMore &&
            filteredAlbums.length >
            ALBUMS_PER_LOAD && (
              <div className="albums-end">
                <span>
                  All {filteredAlbums.length}{' '}
                  albums loaded
                </span>
              </div>
            )}
        </>
      )}
    </section>
  );
}

export default Albums;