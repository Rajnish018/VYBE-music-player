export function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return '0:00';

  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
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
    title: track.title || 'Untitled Track',
    artist: track.artist || 'Unknown Artist',
    album: track.album || 'Single',
    duration: Number(track.duration) || 0,
    thumbnailUrl: getTrackCover(track),
    audioUrl: track.audioUrl,
    sourceUrl: track.sourceUrl,
    playable: track.playable !== false,
  };
}
