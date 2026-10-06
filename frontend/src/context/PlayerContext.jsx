import {

  useCallback,

  useEffect,

  useMemo,

  useRef,

  useState,

} from 'react';

import { API_BASE_URL } from '../api';

import { normalizeTrack } from '../utils/track';

import PlayerContext from './playerContext';






const PLAYER_TRACK_STORAGE_KEY =

  'music-player-track-id';



const PLAYER_PLAYBACK_STATE_STORAGE_KEY =

  'music-player-playback-state';



// Remove the previous per-song map. Normal song selection must always start

// the selected song from the beginning. Only the last active song survives a

// reload/crash.

const LEGACY_PLAYBACK_POSITIONS_STORAGE_KEY =

  'music-player-playback-positions';



const PLAYBACK_PERSIST_INTERVAL_MS = 1000;



function clampVolume(value) {

  const number = Number(value);



  if (!Number.isFinite(number)) {

    return 0;

  }



  return Math.min(1, Math.max(0, number));

}



function safeNumber(value, fallback = 0) {

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;

}



function canResolvePlayback(track) {

  if (!track) {

    return false;

  }



  // YouTube search results are dynamically playable.

  // They do not need playable=true because the backend

  // resolves the stream when the user presses Play.

  if (

    track.source === 'youtube' &&

    track.youtubeId

  ) {

    return true;

  }



  // Normal VYBE/library tracks keep their existing

  // playable flag behaviour.

  return track.playable !== false;

}



function readSavedTrackId() {

  try {

    const value = localStorage.getItem(

      PLAYER_TRACK_STORAGE_KEY,

    );



    return value ? String(value) : '';

  } catch {

    return '';

  }

}



function readSavedPlaybackState() {

  try {

    const raw = localStorage.getItem(

      PLAYER_PLAYBACK_STATE_STORAGE_KEY,

    );



    // The former implementation stored one resume position per song.

    // Remove that store so it cannot restore an old position after a normal

    // song change.

    localStorage.removeItem(

      LEGACY_PLAYBACK_POSITIONS_STORAGE_KEY,

    );



    if (!raw) {

      return null;

    }



    const parsed = JSON.parse(raw);

    const trackId =

      parsed?.trackId == null

        ? ''

        : String(parsed.trackId);

    const currentTime = Number(parsed?.currentTime);

    const duration = Number(parsed?.duration);



    if (

      !trackId ||

      !Number.isFinite(currentTime) ||

      currentTime < 0

    ) {

      return null;

    }



    return {

      trackId,

      currentTime,

      duration:

        Number.isFinite(duration) && duration > 0

          ? duration

          : 0,

      savedAt: Number(parsed?.savedAt) || 0,

    };

  } catch {

    return null;

  }

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



  /*

   * Persisted playback recovery. Position is written about once per second

   * during playback and immediately on pause/page hide/unload.

   */

  const savedPlaybackStateRef = useRef(

    readSavedPlaybackState(),

  );

  const activeTrackIdRef = useRef(

    readSavedTrackId(),

  );

  const initialRestoreDoneRef = useRef(false);

  const activeIndexRef = useRef(activeIndex);

  const lastPersistedAtRef = useRef(0);

  const latestTimeRef = useRef(0);

  const latestDurationRef = useRef(0);

  const latestPlayingRef = useRef(false);

  const restoredPositionTrackRef = useRef(null);



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



  const trackIdsKey = useMemo(

    () =>

      normalizedTracks

        .map((track) => String(track.id))

        .join('|'),

    [normalizedTracks],

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



      const nextQueue = [...stillValid, ...newTracks];



      if (

        nextQueue.length === previousQueue.length &&

        nextQueue.every(

          (track, index) =>

            String(track.id) === String(previousQueue[index]?.id),

        )

      ) {

        return previousQueue;

      }



      return nextQueue;

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



  activeIndexRef.current = activeIndex;



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

    /*
     * YouTube playback.
     *
     * YouTube search results are dynamically resolved by the backend.
     * They must not be blocked by playable=false because that flag means
     * "not a stored VYBE/library stream", not "cannot be resolved".
     *
     * GET /api/share/youtube/audio?id=VIDEO_ID
     */
    if (
      activeTrack.source === 'youtube' &&
      activeTrack.youtubeId
    ) {
      const url = new URL(
        `${API_BASE_URL}/api/share/youtube/audio`,
      );

      url.searchParams.set(
        'id',
        activeTrack.youtubeId,
      );

      return url.toString();
    }

    /*
     * Normal VYBE/library playback.
     */
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
    activeTrack?.source,
    activeTrack?.youtubeId,
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

   * Stop and fully release the audio element when the user logs out.

   *

   * PlayerProvider intentionally stays mounted across route changes, so

   * changing authentication state alone does not destroy the <audio> node.

   */

  useEffect(() => {

    if (token) {

      return;

    }



    const audio = audioRef.current;



    if (!audio) {

      return;

    }



    audio.pause();

    audio.currentTime = 0;

    audio.removeAttribute('src');

    audio.load();



    setIsPlaying(false);

    setCurrentTime(0);

    setDuration(0);

    setIsLoadingAudio(false);

    setPlaybackError('');

    restoredPositionTrackRef.current = null;

  }, [token]);



  /*

   * Restore the last active track once after the library is available.

   *

   * This effect deliberately does NOT depend on activeIndex. Updating

   * activeIndex is the effect's output, so subscribing to it would allow a

   * parent that recreates the setter/array to create an update loop.

   */

  useEffect(() => {

    if (

      initialRestoreDoneRef.current ||

      normalizedTracks.length === 0

    ) {

      return;

    }



    const savedTrackId =

      activeTrackIdRef.current || readSavedTrackId();



    if (!savedTrackId) {

      initialRestoreDoneRef.current = true;

      return;

    }



    const savedIndex = normalizedTracks.findIndex(

      (track) =>

        String(track.id) === String(savedTrackId),

    );



    if (savedIndex === -1) {

      // Wait for the library to contain the saved track. trackIdsKey will

      // change when the data actually changes.

      return;

    }



    initialRestoreDoneRef.current = true;

    activeTrackIdRef.current = String(

      normalizedTracks[savedIndex].id,

    );



    if (savedIndex !== activeIndexRef.current) {

      activeIndexRef.current = savedIndex;

      setActiveIndex(savedIndex);

    }

  }, [trackIdsKey, normalizedTracks.length, setActiveIndex]);



  /*

   * Persist the selected track ID.

   */

  const persistTrackId = useCallback((trackId) => {

    if (!trackId) {

      return;

    }



    const normalizedId = String(trackId);

    activeTrackIdRef.current = normalizedId;



    try {

      localStorage.setItem(

        PLAYER_TRACK_STORAGE_KEY,

        normalizedId,

      );

    } catch {

      // Ignore localStorage errors.

    }

  }, []);



  /*

   * Persist ONLY the last active track.

   *

   * This means:

   *   - reload/crash -> the last active song resumes

   *   - changing/explicitly selecting a song -> that song starts at 0

   */

  const persistPlaybackPosition = useCallback(

    ({ force = false, trackId = null, time = null, duration = null } = {}) => {

      const targetTrackId = trackId

        ? String(trackId)

        : String(activeTrackIdRef.current || '');



      if (!targetTrackId) {

        return;

      }



      const now = Date.now();



      if (

        !force &&

        now - lastPersistedAtRef.current <

        PLAYBACK_PERSIST_INTERVAL_MS

      ) {

        return;

      }



      const audio = audioRef.current;



      const currentTime =

        time == null

          ? (audio && Number.isFinite(audio.currentTime)

            ? Math.max(0, audio.currentTime)

            : Math.max(0, latestTimeRef.current))

          : Math.max(0, safeNumber(time));



      const resolvedDuration =

        duration == null

          ? (audio &&

            Number.isFinite(audio.duration) &&

            audio.duration > 0

            ? audio.duration

            : Math.max(0, latestDurationRef.current))

          : Math.max(0, safeNumber(duration));



      const nextState = {

        trackId: targetTrackId,

        currentTime,

        duration: resolvedDuration,

        savedAt: now,

      };



      try {

        localStorage.setItem(

          PLAYER_PLAYBACK_STATE_STORAGE_KEY,

          JSON.stringify(nextState),

        );



        localStorage.removeItem(

          LEGACY_PLAYBACK_POSITIONS_STORAGE_KEY,

        );



        const previousState = savedPlaybackStateRef.current;

        savedPlaybackStateRef.current = nextState;



        if (

          !previousState ||

          String(previousState.trackId) !== targetTrackId ||

          currentTime === 0

        ) {

          restoredPositionTrackRef.current = null;

        }



        lastPersistedAtRef.current = now;

        latestTimeRef.current = currentTime;

        latestDurationRef.current = resolvedDuration;

      } catch {

        // Ignore localStorage quota/access errors.

      }

    },

    [],

  );



  /*

   * Remove the single persisted resume record.

   */

  const clearPlaybackPosition = useCallback(() => {

    savedPlaybackStateRef.current = null;



    try {

      localStorage.removeItem(

        PLAYER_PLAYBACK_STATE_STORAGE_KEY,

      );

      localStorage.removeItem(

        LEGACY_PLAYBACK_POSITIONS_STORAGE_KEY,

      );

    } catch {

      // Ignore localStorage errors.

    }

  }, []);



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



      console.log('[Player] Selected track:', nextTrack);

      console.log('[Player] YouTube metadata:', {

        id: nextTrack?.id,

        source: nextTrack?.source,

        youtubeId: nextTrack?.youtubeId,

        audioUrl: nextTrack?.audioUrl,

        playable: nextTrack?.playable,

      });



      if (

        activeTrack?.id &&

        String(activeTrack.id) !== String(nextTrack.id)

      ) {

        pushHistory(activeTrack.id);

      }



      // Explicit selection is always a restart, even if it is the same song.

      persistTrackId(nextTrack.id);

      persistPlaybackPosition({

        force: true,

        trackId: nextTrack.id,

        time: 0,

        duration: nextTrack.duration,

      });



      const audio = audioRef.current;

      if (audio) {

        audio.pause();

        try {

          audio.currentTime = 0;

        } catch {

          // Ignore while the source is changing.

        }

      }



      latestTimeRef.current = 0;

      latestDurationRef.current =

        Math.max(0, safeNumber(nextTrack.duration));

      setCurrentTime(0);

      setDuration(nextTrack.duration || 0);



      setTracks(nextQueue);

      setQueue(nextNormalizedTracks);

      activeIndexRef.current = nextIndex;

      setActiveIndex(nextIndex);



      if (!canResolvePlayback(nextTrack)) {

  setIsPlaying(false);

  setPlaybackError(

    'This track is not available for playback.',

  );

  return;

}



      setPlaybackError('');

      setIsPlaying(shouldPlay);

    },

    [

      tracks,

      setTracks,

      setQueue,

      setActiveIndex,

      persistPlaybackPosition,

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



      if (!canResolvePlayback(nextTrack)) {

  setActiveIndex(wrappedIndex);

  setIsPlaying(false);

  setPlaybackError(

    'This track is not available for playback.',

  );

  return;

}



      if (

        activeTrack?.id &&

        String(activeTrack.id) !== String(nextTrack.id)

      ) {

        pushHistory(activeTrack.id);

      }



      persistTrackId(nextTrack.id);

      persistPlaybackPosition({

        force: true,

        trackId: nextTrack.id,

        time: 0,

        duration: nextTrack.duration,

      });



      const audio = audioRef.current;

      if (audio) {

        audio.pause();

        try {

          audio.currentTime = 0;

        } catch {

          // Ignore while media is changing source.

        }

      }



      latestTimeRef.current = 0;

      latestDurationRef.current =

        Math.max(0, safeNumber(nextTrack.duration));

      setCurrentTime(0);

      setDuration(nextTrack.duration || 0);

      activeIndexRef.current = wrappedIndex;

      setActiveIndex(wrappedIndex);

      setPlaybackError('');

      setIsPlaying(true);

    },

    [

      normalizedTracks,

      setActiveIndex,

      persistTrackId,

      persistPlaybackPosition,

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



        if (canResolvePlayback(normalizedTracks[index])) {

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

          (index) => canResolvePlayback(playbackQueue[index]),

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



        if (canResolvePlayback(playbackQueue[index])) {

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

    persistPlaybackPosition({

      force: true,

      trackId: next.id,

      time: 0,

      duration: next.duration,

    });



    const audio = audioRef.current;

    if (audio) {

      audio.pause();

      try {

        audio.currentTime = 0;

      } catch {

        // Ignore while media is changing source.

      }

    }



    latestTimeRef.current = 0;

    latestDurationRef.current =

      Math.max(0, safeNumber(next.duration));

    setCurrentTime(0);

    setDuration(next.duration || 0);

    activeIndexRef.current = nextIndex;

    setActiveIndex(nextIndex);

    setPlaybackError('');

    setIsPlaying(true);

  }, [

    normalizedTracks,

    queue,

    shuffle,

    currentIndex,

    activeTrack?.id,

    pushHistory,

    persistPlaybackPosition,

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

      latestTimeRef.current = 0;

      persistPlaybackPosition({

        force: true,

        time: 0,

      });

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



        if (canResolvePlayback(playbackQueue[index])) {

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

    persistPlaybackPosition({

      force: true,

      trackId: previous.id,

      time: 0,

      duration: previous.duration,

    });



    if (audio) {

      audio.pause();

      try {

        audio.currentTime = 0;

      } catch {

        // Ignore while media is changing source.

      }

    }



    latestTimeRef.current = 0;

    latestDurationRef.current =

      Math.max(0, safeNumber(previous.duration));

    setCurrentTime(0);

    setDuration(previous.duration || 0);

    activeIndexRef.current = previousIndex;

    setActiveIndex(previousIndex);

    setPlaybackError('');

    setIsPlaying(true);

  }, [

    normalizedTracks,

    queue,

    shuffle,

    currentIndex,

    findPlayableIndex,

    persistPlaybackPosition,

    persistTrackId,

    setActiveIndex,

  ]);



  /*

   * Explicitly stop and release the current audio source.

   *

   * This is different from only calling setIsPlaying(false):

   * React state changes do not pause the underlying HTMLAudioElement.

   */

  const stopPlayback = useCallback(() => {

    const audio = audioRef.current;



    if (audio) {

      audio.pause();

      audio.currentTime = 0;

      audio.removeAttribute('src');

      audio.load();

    }



    latestPlayingRef.current = false;

    latestTimeRef.current = 0;

    latestDurationRef.current = 0;



    clearPlaybackPosition();

    restoredPositionTrackRef.current = null;



    setIsPlaying(false);

    setCurrentTime(0);

    setDuration(0);

    setIsLoadingAudio(false);

    setPlaybackError('');

  }, [clearPlaybackPosition]);



  /*

   * Play / pause.

   */

  const togglePlayback = useCallback(() => {

    const audio = audioRef.current;



    if (!audio || !streamUrl) {

  setPlaybackError(

    !canResolvePlayback(activeTrack)

      ? 'This track is not available for playback.'

      : 'No audio source is available for this track.',

  );

  return;

} 



    if (!audio.paused) {

      persistPlaybackPosition({ force: true });

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

    persistPlaybackPosition,

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



      persistPlaybackPosition({

        force: true,

        time: nextTime,

      });

    },

    [persistPlaybackPosition],

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

      clearPlaybackPosition();

      setIsPlaying(false);

      return;

    }



    if (repeat === 'one') {

      const audio = audioRef.current;



      if (audio) {

        audio.currentTime = 0;

        latestTimeRef.current = 0;

        persistPlaybackPosition({

          force: true,

          time: 0,

        });



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



    // A fully finished song has no resume point.

    clearPlaybackPosition();

    latestTimeRef.current = 0;



    if (

      shuffle &&

      normalizedTracks.length > 1

    ) {

      nextTrack();

      return;

    }



    const nextIndex = currentIndex + 1;



    if (nextIndex >= normalizedTracks.length) {

      if (repeat !== 'all') {

        setCurrentTime(0);

        setIsPlaying(false);

        return;

      }



      const firstPlayable =

        normalizedTracks.findIndex(

          (track) => canResolvePlayback(track),

        );



      if (firstPlayable < 0) {

        setCurrentTime(0);

        setIsPlaying(false);

        return;

      }



      const next =

        normalizedTracks[firstPlayable];



      if (activeTrack?.id) {

        pushHistory(activeTrack.id);

      }



      persistTrackId(next.id);

      persistPlaybackPosition({

        force: true,

        trackId: next.id,

        time: 0,

        duration: next.duration,

      });

      setCurrentTime(0);

      setDuration(next.duration || 0);

      latestTimeRef.current = 0;

      latestDurationRef.current =

        Math.max(0, safeNumber(next.duration));

      activeIndexRef.current = firstPlayable;

      setActiveIndex(firstPlayable);

      setPlaybackError('');

      setIsPlaying(true);

      return;

    }



    const nextIndexPlayable =

      findPlayableIndex(currentIndex, 1);



    if (nextIndexPlayable < 0) {

      setCurrentTime(0);

      setIsPlaying(false);

      return;

    }



    const next =

      normalizedTracks[nextIndexPlayable];



    if (activeTrack?.id) {

      pushHistory(activeTrack.id);

    }



    persistTrackId(next.id);

    persistPlaybackPosition({

      force: true,

      trackId: next.id,

      time: 0,

      duration: next.duration,

    });

    setCurrentTime(0);

    setDuration(next.duration || 0);

    latestTimeRef.current = 0;

    latestDurationRef.current =

      Math.max(0, safeNumber(next.duration));

    activeIndexRef.current = nextIndexPlayable;

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

    persistPlaybackPosition,

    persistTrackId,

    clearPlaybackPosition,

    setActiveIndex,

  ]);



  /*

   * Persist the current track before the document is hidden/unloaded.

   */

  useEffect(() => {

    const persistBeforeExit = () => {

      persistPlaybackPosition({ force: true });

    };



    const handleVisibilityChange = () => {

      if (document.visibilityState === 'hidden') {

        persistPlaybackPosition({ force: true });

      }

    };



    window.addEventListener('pagehide', persistBeforeExit);

    window.addEventListener('beforeunload', persistBeforeExit);

    window.addEventListener('freeze', persistBeforeExit);

    document.addEventListener(

      'visibilitychange',

      handleVisibilityChange,

    );



    return () => {

      window.removeEventListener('pagehide', persistBeforeExit);

      window.removeEventListener('beforeunload', persistBeforeExit);

      window.removeEventListener('freeze', persistBeforeExit);

      document.removeEventListener(

        'visibilitychange',

        handleVisibilityChange,

      );

    };

  }, [persistPlaybackPosition]);



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

        const audio = event.currentTarget;

        const mediaDuration = audio.duration;

        const nextDuration =

          Number.isFinite(mediaDuration)

            ? mediaDuration

            : activeTrack?.duration || 0;



        setDuration(nextDuration);

        latestDurationRef.current = nextDuration;



        const trackId = activeTrack?.id;

        const savedState = savedPlaybackStateRef.current;



        if (

          trackId &&

          savedState &&

          String(savedState.trackId) === String(trackId) &&

          restoredPositionTrackRef.current !== String(trackId)

        ) {

          const maxTime =

            Number.isFinite(nextDuration) && nextDuration > 0

              ? nextDuration

              : Number.MAX_SAFE_INTEGER;



          const restoredTime = Math.min(

            Math.max(0, safeNumber(savedState.currentTime)),

            maxTime,

          );



          try {

            audio.currentTime = restoredTime;

          } catch {

            // Some browsers delay seeking until media is sufficiently ready.

          }



          setCurrentTime(restoredTime);

          latestTimeRef.current = restoredTime;

          restoredPositionTrackRef.current = String(trackId);

        }



        setIsLoadingAudio(false);

      },



      onTimeUpdate: (event) => {

        const audio = event.currentTarget;

        const nextTime = Number.isFinite(audio.currentTime)

          ? Math.max(0, audio.currentTime)

          : 0;



        latestTimeRef.current = nextTime;



        if (

          Number.isFinite(audio.duration) &&

          audio.duration > 0

        ) {

          latestDurationRef.current = audio.duration;

        }



        setCurrentTime(nextTime);

        persistPlaybackPosition();

      },



      onPlay: () => {

        latestPlayingRef.current = true;

        setIsPlaying(true);

        setIsLoadingAudio(false);

      },



      onPause: () => {

        latestPlayingRef.current = false;

        setIsPlaying(false);

        persistPlaybackPosition({ force: true });

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

      activeTrack?.id,

      activeTrack?.duration,

      handleEnded,

      persistPlaybackPosition,

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

      stopPlayback,



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

      stopPlayback,

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

