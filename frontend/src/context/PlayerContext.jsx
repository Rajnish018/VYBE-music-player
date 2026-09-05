import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { API_BASE_URL } from '../api';
import { normalizeTrack } from '../utils/track';

const PlayerContext = createContext(null);

const PLAYER_TRACK_STORAGE_KEY =
  'music-player-track-id';

function clampVolume(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.min(1, Math.max(0, number));
}

export function PlayerProvider({
  children,
  tracks,
  setTracks,
  activeIndex,
  setActiveIndex,
  token,

  // Volume is owned by useSettings in App.jsx.
  volume,
  setVolume,
}) {
  /*
   * ONE persistent audio element.
   *
   * All playback state and commands are centralized here.
   */
  const audioRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackError, setPlaybackError] = useState('');

  /*
   * Queue / playback modes.
   *
   * queue is kept as a separate state so the player has one authoritative
   * queue even when the library array changes.
   */
  const [queue, setQueue] = useState([]);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off'); // off | one | all

  /*
   * History is used for predictable Previous behavior while shuffling.
   */
  const historyRef = useRef([]);

  /*
   * Normalize tracks once for the player.
   */
  const normalizedTracks = useMemo(
    () =>
      Array.isArray(tracks)
        ? tracks.map(normalizeTrack)
        : [],
    [tracks],
  );

  /*
   * Keep the centralized queue synchronized with the current library.
   *
   * We intentionally use normalizedTracks as the fallback/source of truth
   * when the application changes its library.
   */
  useEffect(() => {
    setQueue((previousQueue) => {
      if (previousQueue.length === 0) {
        return normalizedTracks;
      }

      const validIds = new Set(
        normalizedTracks.map((track) => String(track.id)),
      );

      const stillValid = previousQueue.filter((track) =>
        validIds.has(String(track.id)),
      );

      const queuedIds = new Set(
        stillValid.map((track) => String(track.id)),
      );

      const newTracks = normalizedTracks.filter(
        (track) => !queuedIds.has(String(track.id)),
      );

      return [...stillValid, ...newTracks];
    });
  }, [normalizedTracks]);

  const currentQueue =
    queue.length > 0 ? queue : normalizedTracks;

  const queueIndex = currentQueue.findIndex(
    (track) =>
      String(track.id) ===
      String(normalizedTracks[activeIndex]?.id),
  );

  const currentIndex =
    queueIndex >= 0 ? queueIndex : activeIndex;

  const activeTrack =
    normalizedTracks[activeIndex] || null;

  const progressMax =
    duration ||
    activeTrack?.duration ||
    0;

  const progressValue = Math.min(
    currentTime,
    progressMax || currentTime,
  );

  /*
   * Stable stream URL.
   *
   * It changes only when the actual playback identity/source changes.
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
   * Keep audio volume synchronized with the centralized settings state.
   */
  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.volume = clampVolume(volume);
  }, [volume]);

  /*
   * Restore the selected TRACK ID after the library loads.
   */
  useEffect(() => {
    if (normalizedTracks.length === 0) {
      return;
    }

    let savedTrackId = null;

    try {
      savedTrackId = localStorage.getItem(
        PLAYER_TRACK_STORAGE_KEY,
      );
    } catch {
      return;
    }

    if (!savedTrackId) {
      return;
    }

    const savedIndex =
      normalizedTracks.findIndex(
        (track) =>
          String(track.id) === String(savedTrackId),
      );

    if (
      savedIndex !== -1 &&
      savedIndex !== currentIndex
    ) {
      setActiveIndex(savedIndex);
    }
  }, [
    normalizedTracks,
    currentIndex,
    setActiveIndex,
  ]);

  /*
   * Persist the selected track ID, never the array index.
   */
  const persistTrackId = useCallback(
    (trackId) => {
      if (!trackId) {
        return;
      }

      try {
        localStorage.setItem(
          PLAYER_TRACK_STORAGE_KEY,
          String(trackId),
        );
      } catch {
        // Ignore localStorage errors.
      }
    },
    [],
  );

  /*
   * Reset time/duration ONLY when the actual track changes.
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
   * Start playback when the source is ready and isPlaying is true.
   */
  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || !streamUrl || !isPlaying) {
      return;
    }

    if (!audio.paused) {
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
   * Add a track transition to history.
   */
  const pushHistory = useCallback((trackId) => {
    if (!trackId) {
      return;
    }

    historyRef.current = [
      ...historyRef.current.filter(
        (id) => String(id) !== String(trackId),
      ),
      trackId,
    ].slice(-50);
  }, []);

  /*
   * Select a track by ID.
   */
  const selectTrack = useCallback(
    (
      trackId,
      queueTracks = tracks,
      shouldPlay = true,
    ) => {
      const nextQueue =
        Array.isArray(queueTracks) &&
        queueTracks.length
          ? queueTracks
          : tracks;

      const nextNormalizedTracks =
        nextQueue.map(normalizeTrack);

      const nextIndex =
        nextNormalizedTracks.findIndex(
          (track) =>
            String(track.id) === String(trackId),
        );

      if (nextIndex < 0) {
        return;
      }

      const nextTrack =
        nextNormalizedTracks[nextIndex];

      setTracks(nextQueue);
      setQueue(nextNormalizedTracks);

      if (
        activeTrack?.id &&
        String(activeTrack.id) !==
          String(nextTrack.id)
      ) {
        pushHistory(activeTrack.id);
      }

      persistTrackId(nextTrack.id);

      if (!nextTrack.playable) {
        audioRef.current?.pause();
        setIsPlaying(false);
        setActiveIndex(nextIndex);
        setPlaybackError(
          'This result is discoverable but not stored in your playable library yet.',
        );
        return;
      }

      setActiveIndex(nextIndex);
      setPlaybackError('');
      setIsPlaying(shouldPlay);
    },
    [
      tracks,
      setTracks,
      setQueue,
      setActiveIndex,
      persistTrackId,
      activeTrack?.id,
      pushHistory,
    ],
  );

  /*
   * Play a track by index.
   */
  const playTrackAt = useCallback(
    (nextIndex) => {
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

      if (
        activeTrack?.id &&
        String(activeTrack.id) !==
          String(nextTrack.id)
      ) {
        pushHistory(activeTrack.id);
      }

      persistTrackId(nextTrack.id);
      setActiveIndex(wrappedIndex);
      setPlaybackError('');
      setIsPlaying(true);
    },
    [
      normalizedTracks,
      setActiveIndex,
      persistTrackId,
      activeTrack?.id,
      pushHistory,
    ],
  );

  /*
   * Return a valid playable index.
   */
  const findPlayableIndex = useCallback(
    (startIndex, direction) => {
      const length = normalizedTracks.length;

      if (!length) {
        return -1;
      }

      let index = startIndex;

      for (let step = 0; step < length; step += 1) {
        index =
          (index + direction + length) %
          length;

        if (normalizedTracks[index]?.playable) {
          return index;
        }
      }

      return -1;
    },
    [normalizedTracks],
  );

  /*
   * Centralized Next.
   */
  const nextTrack = useCallback(() => {
    const playbackQueue =
      queue.length > 0 ? queue : normalizedTracks;

    if (playbackQueue.length === 0) {
      return;
    }

    let nextIndex = -1;

    if (shuffle && playbackQueue.length > 1) {
      const candidates = playbackQueue
        .map((_, index) => index)
        .filter((index) => index !== currentIndex);

      const playableCandidates =
        candidates.filter(
          (index) =>
            playbackQueue[index]?.playable,
        );

      const source =
        playableCandidates.length
          ? playableCandidates
          : candidates;

      nextIndex =
        source[
          Math.floor(Math.random() * source.length)
        ];
    } else {
      let index = currentIndex;

      for (
        let step = 0;
        step < playbackQueue.length;
        step += 1
      ) {
        index =
          (index + 1 + playbackQueue.length) %
          playbackQueue.length;

        if (playbackQueue[index]?.playable) {
          nextIndex = index;
          break;
        }
      }
    }

    if (nextIndex < 0) {
      setIsPlaying(false);
      return;
    }

    const next = playbackQueue[nextIndex];

    if (activeTrack?.id) {
      pushHistory(activeTrack.id);
    }

    persistTrackId(next.id);
    setActiveIndex(nextIndex);
    setPlaybackError('');
    setIsPlaying(true);
  }, [
    normalizedTracks,
    queue,
    shuffle,
    currentIndex,
    findPlayableIndex,
    activeTrack?.id,
    pushHistory,
    persistTrackId,
    setActiveIndex,
  ]);

  /*
   * Centralized Previous.
   *
   * If the current song is more than 3 seconds in, Previous first
   * seeks to the beginning. Otherwise it changes the track.
   */
  const previousTrack = useCallback(() => {
    const audio = audioRef.current;

    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    const playbackQueue =
      queue.length > 0 ? queue : normalizedTracks;

    let previousIndex = -1;

    if (shuffle && historyRef.current.length > 0) {
      const previousId =
        historyRef.current[
          historyRef.current.length - 1
        ];

      historyRef.current =
        historyRef.current.slice(0, -1);

      previousIndex =
        playbackQueue.findIndex(
          (track) =>
            String(track.id) ===
            String(previousId),
        );
    }

    if (previousIndex < 0) {
      let index = currentIndex;

      for (
        let step = 0;
        step < playbackQueue.length;
        step += 1
      ) {
        index =
          (index - 1 + playbackQueue.length) %
          playbackQueue.length;

        if (playbackQueue[index]?.playable) {
          previousIndex = index;
          break;
        }
      }
    }

    if (previousIndex < 0) {
      return;
    }

    const previous =
      playbackQueue[previousIndex];

    persistTrackId(previous.id);
    setActiveIndex(previousIndex);
    setPlaybackError('');
    setIsPlaying(true);
  }, [
    normalizedTracks,
    queue,
    shuffle,
    currentIndex,
    findPlayableIndex,
    persistTrackId,
    setActiveIndex,
  ]);

  /*
   * Play / pause.
   */
  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;

    if (!audio || !streamUrl) {
      setPlaybackError(
        activeTrack?.playable === false
          ? 'This result is discoverable but not stored in your playable library yet.'
          : 'No audio source is available for this track.',
      );
      return;
    }

    if (!audio.paused) {
      audio.pause();
      return;
    }

    setPlaybackError('');

    audio.play().catch((error) => {
      setIsPlaying(false);
      setPlaybackError(
        error?.message ||
          'Playback could not start.',
      );
    });
  }, [
    streamUrl,
    activeTrack?.playable,
  ]);

  /*
   * Seek.
   */
  const seekTo = useCallback(
    (value) => {
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
          // Ignore invalid seek.
        }
      }
    },
    [],
  );

  /*
   * Volume.
   */
  const handleVolumeChange = useCallback(
    (eventOrValue) => {
      const rawValue =
        typeof eventOrValue === 'object'
          ? eventOrValue.target.value
          : eventOrValue;

      const nextVolume =
        clampVolume(rawValue);

      setVolume(nextVolume);
    },
    [setVolume],
  );

  /*
   * Shuffle toggle.
   */
  const updateQueue = useCallback((nextQueue) => {
    const normalizedQueue = Array.isArray(nextQueue)
      ? nextQueue.map(normalizeTrack)
      : [];

    setQueue(normalizedQueue);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((previous) => !previous);
  }, []);

  /*
   * Repeat cycles:
   * off -> all -> one -> off
   */
  const cycleRepeat = useCallback(() => {
    setRepeat((previous) => {
      if (previous === 'off') {
        return 'all';
      }

      if (previous === 'all') {
        return 'one';
      }

      return 'off';
    });
  }, []);

  /*
   * Allow UI components to explicitly set a repeat mode.
   */
  const setRepeatMode = useCallback((mode) => {
    if (
      mode === 'off' ||
      mode === 'all' ||
      mode === 'one'
    ) {
      setRepeat(mode);
    }
  }, []);

  /*
   * Automatically move to the next track.
   */
  const handleEnded = useCallback(() => {
    if (normalizedTracks.length === 0) {
      setIsPlaying(false);
      return;
    }

    /*
     * Repeat-one: replay the same track.
     */
    if (repeat === 'one') {
      const audio = audioRef.current;

      if (audio) {
        audio.currentTime = 0;

        audio.play().catch((error) => {
          setIsPlaying(false);
          setPlaybackError(
            error?.message ||
              'Playback could not restart.',
          );
        });
      }

      return;
    }

    /*
     * Shuffle: choose another playable track.
     */
    if (
      shuffle &&
      normalizedTracks.length > 1
    ) {
      nextTrack();
      return;
    }

    /*
     * Normal next-track behavior.
     */
    const nextIndex = currentIndex + 1;

    if (nextIndex >= normalizedTracks.length) {
      /*
       * Repeat-all wraps to the first playable track.
       * Repeat-off stops at the end of the queue.
       */
      if (repeat !== 'all') {
        setIsPlaying(false);
        return;
      }

      const firstPlayable =
        normalizedTracks.findIndex(
          (track) => track?.playable,
        );

      if (firstPlayable < 0) {
        setIsPlaying(false);
        return;
      }

      const next = normalizedTracks[firstPlayable];

      if (activeTrack?.id) {
        pushHistory(activeTrack.id);
      }

      persistTrackId(next.id);
      setActiveIndex(firstPlayable);
      setPlaybackError('');
      setIsPlaying(true);
      return;
    }

    const nextIndexPlayable =
      findPlayableIndex(currentIndex, 1);

    if (nextIndexPlayable < 0) {
      setIsPlaying(false);
      return;
    }

    const next =
      normalizedTracks[nextIndexPlayable];

    if (activeTrack?.id) {
      pushHistory(activeTrack.id);
    }

    persistTrackId(next.id);
    setActiveIndex(nextIndexPlayable);
    setPlaybackError('');
    setIsPlaying(true);
  }, [
    normalizedTracks,
    repeat,
    shuffle,
    nextTrack,
    currentIndex,
    findPlayableIndex,
    activeTrack?.id,
    pushHistory,
    persistTrackId,
    setActiveIndex,
  ]);

  /*
   * Audio event handlers for the ONE persistent audio element.
   */
  const audioProps = useMemo(
    () => ({
      ref: audioRef,
      src: streamUrl || undefined,
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

      onEnded: handleEnded,

      onError: () => {
        setIsPlaying(false);
        setIsLoadingAudio(false);
        setPlaybackError(
          'This track could not be streamed. Check the file, token, or backend.',
        );
      },
    }),
    [
      streamUrl,
      activeTrack?.duration,
      handleEnded,
    ],
  );

  /*
   * Centralized player API.
   */
  const value = useMemo(
    () => ({
      /*
       * Audio
       */
      audioRef,
      audioProps,

      /*
       * Current track
       */
      activeTrack,
      currentTrack: activeTrack,
      activeIndex,
      currentIndex,

      /*
       * Playback
       */
      isPlaying,
      isLoadingAudio,
      currentTime,
      duration,

      /*
       * Volume
       */
      volume,
      setVolume,
      handleVolumeChange,

      /*
       * Queue
       */
      queue,
      setQueue,

      /*
       * Modes
       */
      shuffle,
      setShuffle,
      toggleShuffle,

      repeat,
      setRepeat,
      setRepeatMode,
      cycleRepeat,

      /*
       * Navigation
       */
      selectTrack,
      playTrackAt,
      nextTrack,
      previousTrack,

      /*
       * Controls
       */
      togglePlayback,
      seekTo,

      /*
       * Progress / errors
       */
      progressMax,
      progressValue,
      playbackError,
      setPlaybackError,
      setIsPlaying,
    }),
    [
      audioProps,
      activeTrack,
      activeIndex,
      currentIndex,
      isPlaying,
      isLoadingAudio,
      currentTime,
      duration,
      volume,
      setVolume,
      handleVolumeChange,
      queue,
      shuffle,
      toggleShuffle,
      repeat,
      setRepeatMode,
      cycleRepeat,
      selectTrack,
      playTrackAt,
      nextTrack,
      previousTrack,
      togglePlayback,
      seekTo,
      progressMax,
      progressValue,
      playbackError,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {/*
       * EXACTLY ONE audio element.
       *
       * No key.
       * No conditional rendering.
       * No audio element in Player.jsx.
       */}
      <audio {...audioProps} />

      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context =
    useContext(PlayerContext);

  if (!context) {
    throw new Error(
      'usePlayer must be used inside PlayerProvider',
    );
  }

  return context;
}