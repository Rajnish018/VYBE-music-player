import Icon from './Icons';
import CoverImage from './CoverImage';
import { formatTime } from '../utils/track';

import './Player.css';

function Player({
  activeTrack,
  activeIndex,
  isPlaying,
  isLoading,
  playbackError,
  progressMax,
  progressValue,
  volume,

  onPlayTrackAt,
  onTogglePlayback,
  onSeek,
  onVolumeChange,

  onNextTrack,
  onPreviousTrack,
  onToggleShuffle,
  onCycleRepeat,

  shuffle = false,
  repeat = 'off',

  token,
}) {
  /* =========================================================
     PREVIOUS TRACK
     ========================================================= */

  const handlePrevious = () => {
    if (typeof onPreviousTrack === 'function') {
      onPreviousTrack();
      return;
    }

    if (typeof onPlayTrackAt === 'function') {
      onPlayTrackAt(activeIndex - 1);
    }
  };

  /* =========================================================
     NEXT TRACK
     ========================================================= */

  const handleNext = () => {
    if (typeof onNextTrack === 'function') {
      onNextTrack();
      return;
    }

    if (typeof onPlayTrackAt === 'function') {
      onPlayTrackAt(activeIndex + 1);
    }
  };

  /* =========================================================
     SHUFFLE
     ========================================================= */

  const handleShuffle = () => {
    if (typeof onToggleShuffle === 'function') {
      onToggleShuffle();
    }
  };

  /* =========================================================
     REPEAT
     ========================================================= */

  const handleRepeat = () => {
    if (typeof onCycleRepeat === 'function') {
      onCycleRepeat();
    }
  };

  /* =========================================================
     VOLUME
     ========================================================= */

  const handleVolumeChange = (event) => {
    const value = Number(event.target.value);

    if (!Number.isFinite(value)) {
      return;
    }

    if (typeof onVolumeChange === 'function') {
      onVolumeChange(value);
    }
  };

  /* =========================================================
     REPEAT LABEL
     ========================================================= */

  const repeatLabel =
    repeat === 'one'
      ? 'Repeat one'
      : repeat === 'all'
        ? 'Repeat all'
        : 'Repeat off';

  /* =========================================================
     SAFE VALUES
     ========================================================= */

  const safeVolume = Number.isFinite(Number(volume))
    ? Math.min(1, Math.max(0, Number(volume)))
    : 0;

  const safeProgress = Number.isFinite(Number(progressValue))
    ? Math.max(0, Number(progressValue))
    : 0;

  const safeMax = Number.isFinite(Number(progressMax))
    ? Math.max(0, Number(progressMax))
    : 0;

  /* =========================================================
     SLIDER VALUES
     ========================================================= */

  const volumePercent = `${safeVolume * 100}%`;

  const progressPercent =
    safeMax > 0
      ? `${Math.min(
        100,
        Math.max(
          0,
          (safeProgress / safeMax) * 100,
        ),
      )}%`
      : '0%';

  const safeProgressValue =
    safeMax > 0
      ? Math.min(safeProgress, safeMax)
      : 0;

  return (
    <footer
      className={`player ${isPlaying ? 'player-playing' : ''
        }`}
    >
      {/* =====================================================
          LEFT — NOW PLAYING
          ===================================================== */}

      <div className="now-playing">
        <div
          className={`player-cover ${isPlaying
              ? 'player-cover-playing'
              : ''
            }`}
        >
          <CoverImage
            src={activeTrack?.thumbnailUrl}
            token={token}
          />
        </div>

        <div className="track-info">
          <strong
            key={activeTrack?.id || 'empty'}
            className="track-title"
            title={
              activeTrack?.title ||
              'Nothing playing'
            }
          >
            {activeTrack?.title ||
              'Nothing playing'}
          </strong>

          <span
            key={`${activeTrack?.id || 'empty'}-artist`}
            className="track-artist"
            title={
              activeTrack?.artist ||
              'No track selected'
            }
          >
            {activeTrack?.artist ||
              'No track selected'}
          </span>
        </div>
      </div>

      {/* =====================================================
          CENTER — PLAYER CONTROLS
          ===================================================== */}

      <div className="transport">

        {/* ===================================================
            TRANSPORT BUTTONS
            =================================================== */}

        <div className="transport-buttons">

          {/* SHUFFLE */}

          <button
            type="button"
            onClick={handleShuffle}
            aria-label={
              shuffle
                ? 'Disable shuffle'
                : 'Enable shuffle'
            }
            aria-pressed={shuffle}
            className={`player-button ${shuffle
                ? 'player-option-active'
                : ''
              }`}
            title={
              shuffle
                ? 'Shuffle on'
                : 'Shuffle off'
            }
          >
            <Icon name="shuffle" />
          </button>

          {/* PREVIOUS */}

          <button
            type="button"
            onClick={handlePrevious}
            aria-label="Previous track"
            className="player-button"
            title="Previous track"
          >
            <Icon name="previous" />
          </button>

          {/* =================================================
              PLAY / PAUSE

              IMPORTANT:
              Do NOT replace this icon with a loader while
              audio is loading.

              The audio can be loading while the user's
              intended state is still Play or Pause.
              ================================================= */}

          <button
            className={`primary-control ${isPlaying
                ? 'primary-control-playing'
                : ''
              }`}
            type="button"
            onClick={onTogglePlayback}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            <Icon
              name={isPlaying ? 'pause' : 'play'}
            />
          </button>

          {/* NEXT */}

          <button
            type="button"
            onClick={handleNext}
            aria-label="Next track"
            className="player-button"
            title="Next track"
          >
            <Icon name="next" />
          </button>

          {/* REPEAT */}

          <button
            type="button"
            onClick={handleRepeat}
            aria-label={repeatLabel}
            aria-pressed={
              repeat !== 'off'
            }
            className={`player-button ${repeat !== 'off'
                ? 'player-option-active'
                : ''
              }`}
            title={repeatLabel}
          >
            <span className="repeat-control">
              <Icon name="repeat" />

              {repeat === 'one' ? (
                <span className="repeat-state-badge">
                  1
                </span>
              ) : repeat === 'all' ? (
                <span className="repeat-state-badge">
                  ∞
                </span>
              ) : null}
            </span>
          </button>
        </div>

        {/* ===================================================
            PROGRESS
            =================================================== */}

        <div
          className={`progress-row ${isLoading
              ? 'progress-row-loading'
              : ''
            }`}
        >
          <span className="progress-time">
            {formatTime(safeProgress)}
          </span>

          <div className="progress-track-wrapper">

            {/* =============================================
                LOADING LINE

                This appears on the progress bar instead
                of putting a loader inside the Play button.
                ============================================= */}

            {isLoading ? (
              <span
                className="player-loading-line"
                aria-hidden="true"
              />
            ) : null}

            <input
              className="progress-slider"
              aria-label="Seek"
              type="range"
              min="0"
              max={safeMax}
              value={safeProgressValue}
              onChange={(event) => {
                onSeek?.(event.target.value);
              }}
              style={{
                '--slider-value':
                  progressPercent,
              }}
            />
          </div>

          <span className="progress-time">
            {formatTime(safeMax)}
          </span>
        </div>

        {/* ===================================================
            PLAYBACK ERROR
            =================================================== */}

        {playbackError ? (
          <p className="player-error">
            {playbackError}
          </p>
        ) : null}
      </div>

      {/* =====================================================
          RIGHT — VOLUME
          ===================================================== */}

      <div className="volume-control">
        <span
          className="volume-icon"
          aria-hidden="true"
        >
          <Icon
            name={
              safeVolume === 0
                ? 'mute'
                : 'volume'
            }
          />
        </span>

        <input
          className="volume-slider"
          aria-label="Volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={safeVolume}
          onChange={handleVolumeChange}
          style={{
            '--slider-value':
              volumePercent,
          }}
        />

        <span className="volume-value">
          {Math.round(
            safeVolume * 100,
          )}
          %
        </span>
      </div>
    </footer>
  );
}

export default Player;