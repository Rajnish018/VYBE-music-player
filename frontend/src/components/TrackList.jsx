import { useState } from 'react';
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
  onSaveToLibrary,
  onSaveYouTube,
  token,
  emptyTitle = 'No tracks',
  emptyCopy = 'There are no tracks to display.',
  showSource = false,
}) {
  const [savingTrackId, setSavingTrackId] =
    useState(null);

  const [savedTrackIds, setSavedTrackIds] =
    useState(() => new Set());

  const handleSelectTrack = (trackId) => {
    if (typeof onSelectTrack !== 'function') {
      return;
    }

    onSelectTrack(
      trackId,
      queueTracks || tracks,
    );
  };

  const handleToggleFavorite = (
    event,
    trackId,
  ) => {
    event.stopPropagation();

    if (typeof onToggleFavorite === 'function') {
      onToggleFavorite(trackId);
    }
  };

  const handleSaveToLibrary = async (
    event,
    track,
  ) => {
    event.stopPropagation();

    const trackId = track?.id;

    const isYouTube =
      track?.source === 'youtube' &&
      Boolean(track?.youtubeId);

    if (
      !trackId ||
      savingTrackId === trackId ||
      savedTrackIds.has(trackId)
    ) {
      return;
    }

    /*
     * YouTube track
     */
    if (isYouTube) {
      if (
        typeof onSaveYouTube !== 'function'
      ) {
        return;
      }
    }

    /*
     * Normal library track
     */
    if (!isYouTube) {
      if (
        typeof onSaveToLibrary !== 'function'
      ) {
        return;
      }
    }

    setSavingTrackId(trackId);

    try {
      if (isYouTube) {
        await onSaveYouTube(
          track.youtubeId,
        );
      } else {
        await onSaveToLibrary(trackId);
      }

      setSavedTrackIds((current) => {
        const next = new Set(current);

        next.add(trackId);

        return next;
      });
    } catch (error) {
      /*
       * Parent handler is responsible for
       * displaying the actual API error.
       */

      console.error(
        '[TrackList] Save failed:',
        error,
      );
    } finally {
      setSavingTrackId(null);
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

        const isYouTube =
          track.source === 'youtube' &&
          Boolean(track.youtubeId);

        const canSave =
          track.playable !== false &&
          (
            isYouTube
              ? typeof onSaveYouTube ===
                'function'
              : typeof onSaveToLibrary ===
                'function'
          );

        const isSaving =
          savingTrackId === track.id;

        const isSaved =
          savedTrackIds.has(track.id);

        return (
          <article
            className={[
              'track-row',
              isActive ? 'active' : '',
              isCurrentlyPlaying
                ? 'playing'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
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
            {/* TRACK NUMBER */}

            <span
              className="track-index"
              aria-hidden="true"
            >
              {isCurrentlyPlaying ? (
                <span className="playing-bars">
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                String(index + 1).padStart(2, '0')
              )}
            </span>

            {/* COVER */}

            <div className="track-cover-wrap">
              <CoverImage
                className="track-cover"
                src={track.thumbnailUrl}
                token={token}
              />

              {isCurrentlyPlaying ? (
                <span
                  className="track-cover-overlay"
                  aria-hidden="true"
                >
                  <span className="playing-dot" />
                </span>
              ) : null}
            </div>

            {/* TITLE / ARTIST */}

            <span className="track-meta">
              <strong title={track.title}>
                {track.title}
              </strong>

              <small title={track.artist}>
                {track.artist}
              </small>

              {showSource &&
              track.source ? (
                <span className="track-source-badge">
                  {track.source === 'youtube'
                    ? 'YouTube'
                    : track.source}
                </span>
              ) : null}
            </span>

            {/* ALBUM */}

            <span
              className="track-album"
              title={track.album || 'Single'}
            >
              {track.album || 'Single'}
            </span>

            {/* DURATION */}

            <span className="track-duration">
              {formatTime(track.duration)}
            </span>

            {/* ACTIONS */}

            <span
              className="track-actions"
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              {/* DOWNLOAD / SAVE BUTTON */}

              {canSave ? (
                <button
                  className={[
                    'track-action',
                    'save',
                    isSaved ? 'active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  type="button"
                  disabled={
                    isSaving || isSaved
                  }
                  aria-label={
                    isSaved
                      ? 'Saved to library'
                      : 'Save to library'
                  }
                  title={
                    isSaved
                      ? 'Saved to library'
                      : 'Save to library'
                  }
                  onClick={(event) =>
                    handleSaveToLibrary(
                      event,
                      track,
                    )
                  }
                >
                  <Icon
                    name={
                      isSaving
                        ? 'loader'
                        : 'download'
                    }
                  />
                </button>
              ) : null}

              {/* FAVORITE BUTTON */}

              {canFavorite ? (
                <button
                  className={[
                    'track-action',
                    'favorite',
                    favoriteIds.has(track.id)
                      ? 'active'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  type="button"
                  aria-label={
                    favoriteIds.has(track.id)
                      ? 'Remove from favorites'
                      : 'Add to favorites'
                  }
                  title={
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
                  className="track-action external"
                  href={track.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open source"
                  title="Open source"
                  onClick={(event) =>
                    event.stopPropagation()
                  }
                >
                  <Icon name="external" />
                </a>
              ) : null}
            </span>
          </article>
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