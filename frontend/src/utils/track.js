export function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(
    totalSeconds / 60,
  );

  const seconds = String(
    totalSeconds % 60,
  ).padStart(2, '0');

  return `${minutes}:${seconds}`;
}

export function getTrackCover(track) {
  return (
    track.thumbnailUrl ||
    track.cover ||
    ''
  );
}

export function normalizeTrack(track) {
  return {
    id: track.id,

    title:
      track.title ||
      'Untitled Track',

    artist:
      track.artist ||
      'Unknown Artist',

    album:
      track.album ||
      'Single',

    duration:
      Number(track.duration) ||
      0,

    thumbnailUrl:
      getTrackCover(track),

    /*
     * Existing playable audio URL.
     *
     * Used by tracks that already have their
     * own backend/storage audio URL.
     */
    audioUrl:
      track.audioUrl,

    /*
     * Existing source URL.
     *
     * Keep this for MEGA/library tracks and
     * other existing track data.
     */
    sourceUrl:
      track.sourceUrl,

    /*
     * YouTube video ID.
     *
     * Example:
     * q-RP99S_qK0
     */
    youtubeId:
      track.youtubeId ||
      track.youtubeVideoId ||
      '',

    /*
     * Track source.
     *
     * Examples:
     * "youtube"
     * "mega"
     */
    source:
      track.source ||
      '',

    /*
     * Existing behavior preserved.
     */
    playable:
      track.playable !== false,
  };
}