import Icon from './Icons';
import CoverImage from './CoverImage';
import { formatTime } from '../utils/track';

function TrackList({
  tracks = [],
  queueTracks,
  activeTrack,
  isPlaying,
  favoriteIds = new Set(),
  onSelectTrack,
  onToggleFavorite,
  token,
  emptyTitle = 'No tracks',
  emptyCopy = 'There are no tracks to display.',
  showSource = false,
}) {
  const handleSelectTrack = (trackId) => {
    if (typeof onSelectTrack !== 'function') {
      return;
    }

    onSelectTrack(
      trackId,
      queueTracks || tracks,
    );
  };

  const handleToggleFavorite = (event, trackId) => {
    event.stopPropagation();

    if (typeof onToggleFavorite === 'function') {
      onToggleFavorite(trackId);
    }
  };

  return (
    <section
      className="track-list"
      aria-label="Track list"
    >
      {tracks.map((track, index) => {
        const isActive =
          String(activeTrack?.id) ===
          String(track?.id);

        const isCurrentlyPlaying =
          isActive && isPlaying;

        const canFavorite =
          track.playable !== false;

        return (
          <div
            className={
              isCurrentlyPlaying
                ? 'track-row active playing'
                : isActive
                  ? 'track-row active'
                  : 'track-row'
            }
            key={`${track.id}-${index}`}
            role="button"
            tabIndex={0}
            onClick={() =>
              handleSelectTrack(track.id)
            }
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' ||
                event.key === ' '
              ) {
                event.preventDefault();

                handleSelectTrack(track.id);
              }
            }}
          >
            <span className="track-index">
              {String(index + 1).padStart(2, '0')}
            </span>

            <CoverImage
              src={track.thumbnailUrl}
              token={token}
            />

            <span className="track-meta">
              <strong>
                {track.title}
              </strong>

              <small>
                {track.artist}
              </small>
            </span>

            <span className="track-album">
              {track.album}
            </span>

            <span className="track-duration">
              {formatTime(track.duration)}
            </span>

            <span
              className="row-equalizer"
              aria-hidden="true"
            >
              {isCurrentlyPlaying
                ? 'Playing'
                : showSource &&
                    track.playable === false
                  ? 'Preview'
                  : index + 1}
            </span>

            {canFavorite ? (
              <button
                className={
                  favoriteIds.has(track.id)
                    ? 'favorite-control active'
                    : 'favorite-control'
                }
                type="button"
                aria-label={
                  favoriteIds.has(track.id)
                    ? 'Remove from favorites'
                    : 'Add to favorites'
                }
                onClick={(event) =>
                  handleToggleFavorite(
                    event,
                    track.id,
                  )
                }
              >
                <Icon name="heart" />
              </button>
            ) : track.sourceUrl ? (
              <a
                className="external-control"
                href={track.sourceUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open source"
                onClick={(event) =>
                  event.stopPropagation()
                }
              >
                <Icon name="external" />
              </a>
            ) : (
              <span />
            )}
          </div>
        );
      })}

      {tracks.length === 0 ? (
        <div className="empty-state">
          <h3>{emptyTitle}</h3>

          <p>{emptyCopy}</p>
        </div>
      ) : null}
    </section>
  );
}

export default TrackList;