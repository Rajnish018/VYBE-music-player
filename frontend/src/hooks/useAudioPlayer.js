import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '../api';
import { normalizeTrack } from '../utils/track';

export function useAudioPlayer({
  tracks,
  setTracks,
  activeIndex,
  setActiveIndex,
  token,
  volume,
}) {
  const audioRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackError, setPlaybackError] = useState('');

  /*
   * Normalize tracks for consistent track data.
   */
  const normalizedTracks = useMemo(
    () => tracks.map(normalizeTrack),
    [tracks],
  );

  const activeTrack =
    normalizedTracks[activeIndex] || null;

  /*
   * Progress values.
   */
  const progressMax =
    duration || activeTrack?.duration || 0;

  const progressValue = Math.min(
    currentTime,
    progressMax || currentTime,
  );

  /*
   * IMPORTANT:
   *
   * Do NOT use:
   *
   * [activeTrack, token]
   *
   * because a library refresh can create a new
   * object for the same track.
   *
   * Instead depend on the actual playback identity:
   *
   * - track ID
   * - playable status
   * - audio URL
   * - token
   */
  const streamUrl = useMemo(() => {
    if (!activeTrack) {
      return '';
    }

    if (activeTrack.playable === false) {
      return '';
    }

    if (activeTrack.audioUrl) {
      return activeTrack.audioUrl;
    }

    if (!token) {
      return '';
    }

    const url = new URL(
      `${API_BASE_URL}/api/tracks/${activeTrack.id}/play`,
    );

    url.searchParams.set('token', token);

    return url.toString();
  }, [
    activeTrack?.id,
    activeTrack?.playable,
    activeTrack?.audioUrl,
    token,
  ]);

  /*
   * Update volume without changing the audio source.
   */
  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const nextVolume = Number(volume);

    audio.volume = Number.isFinite(nextVolume)
      ? Math.min(1, Math.max(0, nextVolume))
      : 0.7;
  }, [volume]);

  /*
   * Reset playback information ONLY when the
   * actual track changes.
   */
  useEffect(() => {
    setCurrentTime(0);
    setDuration(activeTrack?.duration || 0);
    setPlaybackError('');
  }, [
    activeTrack?.id,
    activeTrack?.duration,
  ]);

  /*
   * Start playback when:
   *
   * - a new valid stream URL is available
   * - player state says it should be playing
   *
   * This does NOT call play() on every unrelated
   * component render.
   */
  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (!streamUrl) {
      return;
    }

    if (!isPlaying) {
      return;
    }

    audio.play().catch((error) => {
      setIsPlaying(false);

      setPlaybackError(
        error?.message ||
          'Playback could not start.',
      );
    });
  }, [streamUrl, isPlaying]);

  /*
   * Select a track.
   */
  function selectTrack(
    trackId,
    queueTracks = tracks,
    shouldPlay = true,
  ) {
    const nextQueue =
      queueTracks.length
        ? queueTracks
        : tracks;

    const nextNormalizedTracks =
      nextQueue.map(normalizeTrack);

    const nextIndex =
      nextNormalizedTracks.findIndex(
        (track) => track.id === trackId,
      );

    if (nextIndex < 0) {
      return;
    }

    const nextTrack =
      nextNormalizedTracks[nextIndex];

    /*
     * Update queue.
     */
    setTracks(nextQueue);

    /*
     * Handle non-playable tracks.
     */
    if (!nextTrack.playable) {
      audioRef.current?.pause();

      setIsPlaying(false);
      setActiveIndex(nextIndex);

      setPlaybackError(
        'This result is discoverable but not stored in your playable library yet.',
      );

      return;
    }

    /*
     * Select playable track.
     */
    setActiveIndex(nextIndex);
    setPlaybackError('');
    setIsPlaying(shouldPlay);
  }

  /*
   * Play track at a specific index.
   */
  function playTrackAt(nextIndex) {
    if (normalizedTracks.length === 0) {
      return;
    }

    const wrappedIndex =
      (nextIndex + normalizedTracks.length) %
      normalizedTracks.length;

    const nextTrack =
      normalizedTracks[wrappedIndex];

    if (!nextTrack?.playable) {
      setActiveIndex(wrappedIndex);
      setIsPlaying(false);

      setPlaybackError(
        'This result is discoverable but not stored in your playable library yet.',
      );

      return;
    }

    setActiveIndex(wrappedIndex);
    setIsPlaying(true);
  }

  /*
   * Toggle play / pause.
   */
  function togglePlayback() {
    const audio = audioRef.current;

    if (!audio || !streamUrl) {
      setPlaybackError(
        activeTrack?.playable === false
          ? 'This result is discoverable but not stored in your playable library yet.'
          : 'No audio source is available for this track.',
      );

      return;
    }

    /*
     * Pause.
     */
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);

      return;
    }

    /*
     * Play.
     */
    setPlaybackError('');

    audio
      .play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch((error) => {
        setIsPlaying(false);

        setPlaybackError(
          error?.message ||
            'Playback could not start.',
        );
      });
  }

  /*
   * Seek to a specific position.
   */
  function seekTo(value) {
    const audio = audioRef.current;
    const nextTime = Number(value);

    if (!Number.isFinite(nextTime)) {
      return;
    }

    setCurrentTime(nextTime);

    if (audio) {
      try {
        audio.currentTime = nextTime;
      } catch {
        // Ignore invalid media seek errors.
      }
    }
  }

  /*
   * The SINGLE persistent audio element should be
   * rendered by PlayerProvider.
   *
   * Do NOT add a React key here.
   *
   * Do NOT create another <audio> element inside
   * Player.jsx or route components.
   */
  const audioProps = {
    ref: audioRef,

    src: streamUrl,

    preload: 'metadata',

    onCanPlay: () => {
      setIsLoadingAudio(false);
    },

    onLoadStart: () => {
      setIsLoadingAudio(true);
    },

    onLoadedMetadata: (event) => {
      const mediaDuration =
        event.currentTarget.duration;

      setDuration(
        Number.isFinite(mediaDuration)
          ? mediaDuration
          : activeTrack?.duration || 0,
      );

      setIsLoadingAudio(false);
    },

    onTimeUpdate: (event) => {
      setCurrentTime(
        event.currentTarget.currentTime,
      );
    },

    onPlay: () => {
      setIsPlaying(true);
      setIsLoadingAudio(false);
    },

    onPause: () => {
      setIsPlaying(false);
    },

    onEnded: () => {
      playTrackAt(activeIndex + 1);
    },

    onError: () => {
      setIsPlaying(false);
      setIsLoadingAudio(false);

      setPlaybackError(
        'This track could not be streamed. Check the file, token, or backend.',
      );
    },
  };

  return {
    audioProps,

    activeTrack,

    isPlaying,

    isLoadingAudio,

    playbackError,

    progressMax,

    progressValue,

    setPlaybackError,

    setIsPlaying,

    selectTrack,

    playTrackAt,

    togglePlayback,

    seekTo,
  };
}