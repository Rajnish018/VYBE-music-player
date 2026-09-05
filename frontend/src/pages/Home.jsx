import Icon from '../components/Icons';
import CoverImage from '../components/CoverImage';
import TrackList from '../components/TrackList';
import './Hero.css';

function Home({
  apiState,
  dataError,
  onRetry,
  activeTrack,
  isPlaying,
  isLoading,
  onTogglePlayback,
  featuredTracks,
  recentlyAddedTracks,
  favoriteCount,
  favoriteIds,
  onSelectTrack,
  onToggleFavorite,
  token,
}) {
  return (
    <>
      {/* =====================================================
          HEADER
          ===================================================== */}

      <header className="topbar">
        <div>
          <p className="eyebrow">
            Production Music Player
          </p>

          <h1>Your listening room</h1>
        </div>

        <div className={`status-pill ${apiState.tone}`}>
          <span>{apiState.label}</span>
          <small>{apiState.detail}</small>
        </div>
      </header>

      {/* =====================================================
          ERROR
          ===================================================== */}

      {dataError ? (
        <div className="error-state">
          <span>{dataError}</span>

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

      <section
        className="hero-panel"
        aria-label="Now playing"
      >
        <div className="hero-cover-wrapper">
          <CoverImage
            className="hero-cover"
            src={activeTrack?.thumbnailUrl}
            token={token}
          />
        </div>

        <div className="hero-copy">
          <p className="eyebrow">
            Now Playing
          </p>

          <h2
            title={activeTrack?.title || 'Nothing playing'}
          >
            {activeTrack?.title || 'Nothing playing'}
          </h2>

          <p>
            {activeTrack?.artist ||
              'Your uploaded library will appear here.'}
          </p>
        </div>

        <button
          className={`hero-play ${
            isPlaying ? 'hero-play-active' : ''
          }`}
          type="button"
          onClick={onTogglePlayback}
          aria-label={
            isPlaying
              ? 'Pause current track'
              : 'Play current track'
          }
          title={
            isPlaying
              ? 'Pause'
              : 'Play'
          }
        >
          {isLoading ? (
            <Icon name="loader" />
          ) : (
            <Icon
              name={
                isPlaying
                  ? 'pause'
                  : 'play'
              }
            />
          )}
        </button>
      </section>

      {/* =====================================================
          LIBRARY STATS
          ===================================================== */}

      <section
        className="stat-grid"
        aria-label="Library summary"
      >
        <div className="stat-tile">
          <span>{featuredTracks.length}</span>
          <small>Playable tracks</small>
        </div>

        <div className="stat-tile">
          <span>{favoriteCount}</span>
          <small>Favorites</small>
        </div>

        <div className="stat-tile">
          <span>{recentlyAddedTracks.length}</span>
          <small>Recently added</small>
        </div>
      </section>

      {/* =====================================================
          RECOMMENDED
          ===================================================== */}

      <section className="library-header">
        <div>
          <h2>
            Recommended from your library
          </h2>

          <p>
            {featuredTracks.length} tracks ready to play
          </p>
        </div>
      </section>

      <TrackList
        tracks={featuredTracks}
        queueTracks={featuredTracks}
        activeTrack={activeTrack}
        isPlaying={isPlaying}
        favoriteIds={favoriteIds}
        onSelectTrack={onSelectTrack}
        onToggleFavorite={onToggleFavorite}
        token={token}
        emptyTitle="Your library is empty"
        emptyCopy="Upload an audio file from the admin panel to start listening."
      />
    </>
  );
}

export default Home;