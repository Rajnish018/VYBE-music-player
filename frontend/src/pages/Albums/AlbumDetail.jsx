import { useMemo } from 'react';
import {
  useNavigate,
  useParams,
} from 'react-router-dom';

import Icon from '../../components/Icons';
import CoverImage from '../../components/CoverImage';
import TrackList from '../../components/TrackList';

import './Albums.css';

function normalizeAlbumName(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function getAlbumCover(tracks) {
  return (
    tracks.find(
      (track) => track?.thumbnailUrl,
    )?.thumbnailUrl || ''
  );
}

function AlbumDetail({
  tracks = [],
  token,
  activeTrack,
  isPlaying,
  onPlay,
  onTogglePlayback,
  favoriteIds = new Set(),
  onToggleFavorite,
}) {
  const navigate = useNavigate();
  const { albumKey } = useParams();

  const decodedAlbumKey = decodeURIComponent(
    albumKey || '',
  );

  /*
   * Build the album from the complete library.
   */
  const album = useMemo(() => {
    const albumTracks = tracks.filter(
      (track) =>
        normalizeAlbumName(
          track?.album || 'Unknown Album',
        ) === decodedAlbumKey,
    );

    if (!albumTracks.length) {
      return null;
    }

    const first = albumTracks[0];

    const albumName =
      first?.album?.trim() ||
      'Unknown Album';

    const artists = [
      ...new Set(
        albumTracks
          .map(
            (track) =>
              track?.artist?.trim() ||
              track?.albumArtist?.trim(),
          )
          .filter(Boolean),
      ),
    ];

    const artist =
      artists.length === 0
        ? 'Unknown Artist'
        : artists.length === 1
          ? artists[0]
          : 'Various Artists';

    /*
     * Keep album songs in proper disc/track order.
     */
    const sortedTracks = [...albumTracks].sort(
      (a, b) => {
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
          String(
            a?.title || '',
          ).localeCompare(
            String(
              b?.title || '',
            ),
          )
        );
      },
    );

    return {
      name: albumName,
      artist,
      year: first?.releaseYear || '',
      cover: getAlbumCover(
        sortedTracks,
      ),
      tracks: sortedTracks,
    };
  }, [
    tracks,
    decodedAlbumKey,
  ]);

  /*
   * Album not found.
   */
  if (!album) {
    return (
      <section className="albums-page">
        <div className="albums-empty">
          <Icon name="music" />

          <h2>
            Album not found
          </h2>

          <p>
            This album is no longer
            available.
          </p>

          <button
            type="button"
            className="album-back"
            onClick={() =>
              navigate('/albums')
            }
          >
            <span>‹</span>
            Back to albums
          </button>
        </div>
      </section>
    );
  }

  /*
   * Check whether the current player
   * track belongs to THIS album.
   */
  const activeAlbumTrack =
    album.tracks.some(
      (track) =>
        String(track?.id) ===
        String(activeTrack?.id),
    );

  /*
   * True only if a track from this album
   * is currently playing.
   */
  const albumIsPlaying =
    activeAlbumTrack &&
    isPlaying;

  /*
   * Play a specific album track.
   *
   * IMPORTANT:
   * The complete album is passed as
   * the queue.
   */
  function handlePlayTrack(
    trackId,
    albumTracks = album.tracks,
  ) {
    if (
      typeof onPlay !==
      'function'
    ) {
      return;
    }

    const track =
      albumTracks.find(
        (item) =>
          String(item?.id) ===
          String(trackId),
      );

    if (!track) {
      return;
    }

    onPlay(
      track,
      albumTracks,
    );
  }

  /*
   * Play/pause the album.
   */
  function handlePlayAlbum() {
    if (!album.tracks.length) {
      return;
    }

    /*
     * If a song from this album is
     * currently playing, pause it.
     */
    if (albumIsPlaying) {
      if (
        typeof onTogglePlayback ===
        'function'
      ) {
        onTogglePlayback();
      }

      return;
    }

    /*
     * Otherwise start from the
     * first album track.
     */
    handlePlayTrack(
      album.tracks[0].id,
      album.tracks,
    );
  }

  return (
    <section className="albums-page">
      {/* =========================
          ALBUM HERO
          ========================= */}
      <header className="album-hero">
        <div className="album-hero-cover">
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
        </div>

        <div className="album-hero-info">
          <span className="albums-eyebrow">
            Album
          </span>

          <h1>
            {album.name}
          </h1>

          <p className="album-artist">
            {album.artist}
          </p>

          <div className="album-meta">
            {album.year ? (
              <span>
                {album.year}
              </span>
            ) : null}

            <span>
              {album.tracks.length}{' '}
              {album.tracks.length === 1
                ? 'song'
                : 'songs'}
            </span>
          </div>

          {/* =========================
              PLAY ALBUM
              ========================= */}
          {album.tracks.length > 0 ? (
            <button
              type="button"
              className="album-play-button"
              onClick={
                handlePlayAlbum
              }
            >
              <Icon
                name={
                  albumIsPlaying
                    ? 'pause'
                    : 'play'
                }
              />

              {albumIsPlaying
                ? 'Pause'
                : 'Play album'}
            </button>
          ) : null}
        </div>
      </header>

      {/* =========================
          TRACKLIST
          ========================= */}
      
        <div className="album-songs-heading">
          <div>
            <span className="albums-eyebrow">
              Tracklist
            </span>

            <h2>
              Songs
            </h2>
          </div>

          <span>
            {album.tracks.length}
          </span>
        </div>

        <TrackList
          tracks={album.tracks}
          queueTracks={album.tracks}
          activeTrack={activeTrack}
          isPlaying={isPlaying}
          favoriteIds={
            favoriteIds
          }
          onSelectTrack={
            handlePlayTrack
          }
          onToggleFavorite={
            onToggleFavorite
          }
          token={token}
          emptyTitle="No songs"
          emptyCopy="This album does not contain any songs."
        />

    </section>
  );
}

export default AlbumDetail;