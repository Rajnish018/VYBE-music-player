import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Icon from '../components/Icons';
import CoverImage from '../components/CoverImage';
import TrackList from '../components/TrackList';

import { getArtistGroups } from '../utils/artistUtils';
import publicArtistsApi from '../api/publicArtistsApi';

import './Hero.css';

function Home({
  apiState,
  dataError,
  onRetry,
  activeTrack,
  isPlaying,
  isLoading,
  onTogglePlayback,
  featuredTracks = [],
  recentlyPlayedTracks = [],
  recentlyAddedTracks = [],
  favoriteCount = 0,
  favoriteIds = [],
  onSelectTrack,
  onToggleFavorite,
  token,
}) {
  const navigate = useNavigate();

  /* =====================================================
     DATABASE ARTISTS
  ===================================================== */

  const [databaseArtists, setDatabaseArtists] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadArtists() {
      try {
        const data = await publicArtistsApi.list(token);

        if (cancelled) {
          return;
        }

        const artists = Array.isArray(data)
          ? data
          : Array.isArray(data?.artists)
            ? data.artists
            : [];

        setDatabaseArtists(artists);
      } catch (error) {
        console.error(
          'Failed to load public artists:',
          error
        );

        if (!cancelled) {
          setDatabaseArtists([]);
        }
      }
    }

    if (token) {
      loadArtists();
    } else {
      setDatabaseArtists([]);
    }

    return () => {
      cancelled = true;
    };
  }, [token]);

  /* =====================================================
     POPULAR ARTISTS
  ===================================================== */

  const popularArtists = useMemo(() => {
    const groups = getArtistGroups(
      featuredTracks
    );

    if (!groups.length) {
      return [];
    }

    /*
     * Create a lookup table from database artists.
     *
     * Example:
     *
     * "arijit singh" -> {
     *   id,
     *   name,
     *   coverUrl,
     *   description
     * }
     */
    const artistMap = new Map();

    databaseArtists.forEach((artist) => {
      if (!artist?.name) {
        return;
      }

      artistMap.set(
        artist.name.trim().toLowerCase(),
        artist
      );
    });

    /*
     * Merge track-based artists with database artists.
     *
     * Track data still determines which artists are
     * popular. Database Artist data supplies the image.
     */
    return groups
      .slice(0, 10)
      .map((artist) => {
        const artistName =
          artist?.name ||
          artist?.artist ||
          '';

        const databaseArtist =
          artistMap.get(
            artistName
              .trim()
              .toLowerCase()
          );

        return {
          ...artist,

          id:
            databaseArtist?.id ||
            artist?.id ||
            artist?.key,

          name:
            databaseArtist?.name ||
            artistName,

          cover:
            databaseArtist?.coverUrl ||
            artist?.cover ||
            '',

          description:
            databaseArtist?.description ||
            '',
        };
      });
  }, [
    featuredTracks,
    databaseArtists,
  ]);

  /* =====================================================
     RENDER
  ===================================================== */

  return (
    <>
      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="topbar">
        <div>
          <p className="eyebrow">
            Home
          </p>

          <h1>
            Your listening room
          </h1>
        </div>

        {apiState ? (
          <div
            className={`status-pill ${apiState.tone || ''
              }`}
          >
            <span>
              {apiState.label}
            </span>

            <small>
              {apiState.detail}
            </small>
          </div>
        ) : null}
      </header>

      {/* =====================================================
          ERROR
      ===================================================== */}

      {dataError ? (
        <div className="error-state">
          <span>
            {dataError}
          </span>

          <button
            type="button"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* =====================================================
          HERO / NOW PLAYING
      ===================================================== */}

      {/* =====================================================
    HERO / NOW PLAYING
===================================================== */}

      <section
        className="hero-panel"
        aria-label="Now playing"
      >
        {/* COVER */}
        <div className="hero-cover-wrapper">
          <CoverImage
            className="hero-cover"
            src={activeTrack?.thumbnailUrl}
            token={token}
          />
        </div>

        {/* TRACK INFORMATION */}
        <div className="hero-copy">
          <p className="eyebrow hero-now-playing">
            Now Playing
          </p>

          <h2
            className="hero-track-title"
            title={
              activeTrack?.title ||
              'Nothing playing'
            }
          >
            {activeTrack?.title ||
              'Nothing playing'}
          </h2>

          <div className="hero-track-details">
            <p
              className="hero-track-artist"
              title={
                activeTrack?.artist ||
                'Unknown artist'
              }
            >
              {activeTrack?.artist ||
                'Unknown artist'}
            </p>

            {activeTrack?.album ? (
              <span className="hero-track-album">
                {activeTrack.album}
              </span>
            ) : null}
          </div>
        </div>

        {/* PLAY / PAUSE */}
        <button
          className={`hero-play ${isPlaying
              ? 'hero-play-active'
              : ''
            } ${isLoading
              ? 'hero-play-loading'
              : ''
            }`}
          type="button"
          onClick={onTogglePlayback}
          aria-label={
            isPlaying
              ? 'Pause'
              : 'Play'
          }
          title={
            isPlaying
              ? 'Pause'
              : 'Play'
          }
        >
          <Icon
            name={
              isPlaying
                ? 'pause'
                : 'play'
            }
          />
        </button>
      </section>

      {/* =====================================================
          JUMP BACK IN / RECENTLY PLAYED
      ===================================================== */}

      <section
        className="jump-back-section"
        aria-labelledby="jump-back-title"
      >
        <div className="jump-back-header">
          <h2 id="jump-back-title">
            Jump back in
          </h2>
        </div>

        {recentlyPlayedTracks.length >
          0 ? (
          <div className="jump-back-list">
            {recentlyPlayedTracks.map(
              (track) => {
                const isActive =
                  activeTrack?.id ===
                  track?.id;

                const showPause =
                  isActive &&
                  isPlaying;

                return (
                  <button
                    type="button"
                    key={track.id}
                    className={`jump-back-card ${isActive
                      ? 'jump-back-card-active'
                      : ''
                      }`}
                    onClick={() =>
                      onSelectTrack(
                        track.id,
                        recentlyPlayedTracks,
                        true
                      )
                    }
                    aria-label={`Play ${track.title ||
                      'Unknown title'
                      }`}
                  >
                    {/* Cover */}

                    <div className="jump-back-cover">
                      <CoverImage
                        src={
                          track.thumbnailUrl
                        }
                        token={token}
                      />

                      <span
                        className="jump-back-play"
                        aria-hidden="true"
                      >
                        <Icon
                          name={
                            showPause
                              ? 'pause'
                              : 'play'
                          }
                        />
                      </span>
                    </div>

                    {/* Track information */}

                    <div className="jump-back-info">
                      <strong
                        title={
                          track.title ||
                          'Unknown title'
                        }
                      >
                        {track.title ||
                          'Unknown title'}
                      </strong>

                      <span
                        title={
                          track.artist ||
                          'Unknown artist'
                        }
                      >
                        {track.artist ||
                          'Unknown artist'}
                      </span>
                    </div>
                  </button>
                );
              }
            )}
          </div>
        ) : (
          <div className="jump-back-empty">
            <Icon name="music" />

            <div>
              <strong>
                No recently played songs
              </strong>

              <span>
                Songs you play will appear
                here.
              </span>
            </div>
          </div>
        )}
      </section>

      {/* =====================================================
          POPULAR ARTISTS
      ===================================================== */}

      <section
        className="popular-artists-section"
        aria-labelledby="popular-artists-title"
      >
        <div className="popular-artists-header">
          <h2 id="popular-artists-title">
            Popular artists
          </h2>

          {popularArtists.length >
            0 ? (
            <button
              type="button"
              className="popular-artists-show-all"
              onClick={() =>
                navigate('/artists')
              }
            >
              Show all
            </button>
          ) : null}
        </div>

        {popularArtists.length >
          0 ? (
          <div className="popular-artists-list">
            {popularArtists.map(
              (artist) => {
                /*
                 * Prefer database artist id.
                 *
                 * If no DB artist exists, fall
                 * back to the existing artist key.
                 */
                const artistRouteKey =
                  artist.key ||
                  artist.name;

                return (
                  <button
                    type="button"
                    key={
                      artist.id ||
                      artist.key ||
                      artist.name
                    }
                    className="popular-artist-card"
                    onClick={() =>
                      navigate(
                        `/artists/${encodeURIComponent(
                          artistRouteKey
                        )}`
                      )
                    }
                  >
                    {/* Artist image */}

                    <div className="popular-artist-image">
                      {artist.cover ? (
                        <CoverImage
                          src={
                            artist.cover
                          }
                          token={token}
                        />
                      ) : (
                        <div className="popular-artist-placeholder">
                          <Icon name="user" />
                        </div>
                      )}

                      <span
                        className="popular-artist-play"
                        aria-hidden="true"
                      >
                        <Icon name="play" />
                      </span>
                    </div>

                    {/* Artist name */}

                    <div className="popular-artist-info">
                      <strong
                        title={
                          artist.name
                        }
                      >
                        {artist.name}
                      </strong>
                    </div>
                  </button>
                );
              }
            )}
          </div>
        ) : null}
      </section>

      {/* =====================================================
          LIBRARY STATS
      ===================================================== */}

      <section
        className="stat-grid"
        aria-label="Library summary"
      >
        <div className="stat-tile">
          <span>
            {featuredTracks.length}
          </span>

          <small>
            Playable tracks
          </small>
        </div>

        <div className="stat-tile">
          <span>
            {favoriteCount}
          </span>

          <small>
            Favorites
          </small>
        </div>

        <div className="stat-tile">
          <span>
            {recentlyAddedTracks.length}
          </span>

          <small>
            Recently added
          </small>
        </div>
      </section>

      {/* =====================================================
          RECOMMENDED
      ===================================================== */}

      <section
        className="library-header"
        aria-labelledby="recommended-title"
      >
        <div>
          <h2 id="recommended-title">
            Recommended from your
            library
          </h2>

          <p>
            {featuredTracks.length}{' '}
            {featuredTracks.length === 1
              ? 'track'
              : 'tracks'}{' '}
            ready to play
          </p>
        </div>
      </section>

      <TrackList
        tracks={featuredTracks}
        queueTracks={featuredTracks}
        activeTrack={activeTrack}
        isPlaying={isPlaying}
        favoriteIds={favoriteIds}
        onSelectTrack={
          onSelectTrack
        }
        onToggleFavorite={
          onToggleFavorite
        }
        token={token}
        emptyTitle="Your library is empty"
        emptyCopy="Upload an audio file from the admin panel to start listening."
      />
    </>
  );
}

export default Home;