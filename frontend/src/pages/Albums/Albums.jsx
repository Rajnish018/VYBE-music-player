import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icons';
import CoverImage from '../../components/CoverImage';
import './Albums.css';

function normalizeAlbumName(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function getAlbumCover(albumTracks) {
  return (
    albumTracks.find((track) => track?.thumbnailUrl)?.thumbnailUrl || ''
  );
}

function Albums({ tracks = [], token }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const albums = useMemo(() => {
    const grouped = new Map();

    tracks.forEach((track) => {
      const rawAlbumName = track?.album?.trim();

      const albumName = rawAlbumName || 'Unknown Album';

      // Case-insensitive + whitespace-normalized key
      const key = normalizeAlbumName(albumName);

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key).push(track);
    });

    return [...grouped.entries()]
      .map(([key, albumTracks]) => {
        const first = albumTracks[0];

        const albumName =
          first?.album?.trim() || 'Unknown Album';

        const artists = [
          ...new Set(
            albumTracks
              .map(
                (track) =>
                  track?.artist?.trim() ||
                  track?.albumArtist?.trim()
              )
              .filter(Boolean)
          ),
        ];

        const artistName =
          artists.length === 0
            ? 'Unknown Artist'
            : artists.length === 1
              ? artists[0]
              : 'Various Artists';

        const sortedTracks = [...albumTracks].sort((a, b) => {
          const discA = Number(a?.discNumber) || 0;
          const discB = Number(b?.discNumber) || 0;

          const trackA = Number(a?.trackNumber) || 0;
          const trackB = Number(b?.trackNumber) || 0;

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
        a.name.localeCompare(b.name)
      );
  }, [tracks]);

  const filteredAlbums = useMemo(() => {
    const clean = normalizeAlbumName(query);

    if (!clean) {
      return albums;
    }

    return albums.filter((album) =>
      normalizeAlbumName(
        `${album.name} ${album.artist} ${album.year}`
      ).includes(clean)
    );
  }, [albums, query]);

  function openAlbum(album) {
    navigate(
      `/albums/${encodeURIComponent(album.key)}`
    );
  }

  return (
    <section className="albums-page">
      <header className="albums-header">
        <div>
          <span className="albums-eyebrow">
            Library
          </span>

          <h1>Albums</h1>

          <p>
            Browse your music collection by album.
          </p>
        </div>

        <div className="albums-count">
          <strong>{albums.length}</strong>
          <span>albums</span>
        </div>
      </header>

      <div className="albums-toolbar">
        <div className="album-search">
          <Icon name="search" />

          <input
            type="search"
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search albums..."
            aria-label="Search albums"
          />
        </div>
      </div>

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
        <div className="albums-grid">
          {filteredAlbums.map((album) => (
            <button
              type="button"
              className="album-card"
              key={album.key}
              onClick={() => openAlbum(album)}
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
                <strong>{album.name}</strong>

                <span>{album.artist}</span>

                <small>
                  {album.year
                    ? `${album.year} · `
                    : ''}

                  {album.tracks.length}{' '}
                  {album.tracks.length === 1
                    ? 'song'
                    : 'songs'}
                </small>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default Albums;