import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { API_BASE_URL } from '../api/client';
import { normalizeTrack } from '../utils/track';

const DEFAULT_VOLUME = 1;

const VOLUME_STORAGE_KEY =
  'music-player-volume';

export function useAudioPlayer({
  tracks = [],
  currentTrack = null,
  onTrackChange,
  onTrackEnded,
  initialVolume = DEFAULT_VOLUME,
}) {
  /*
   * ============================================================
   * AUDIO ELEMENT
   * ============================================================
   *
   * IMPORTANT:
   *
   * There must be ONE persistent <audio> element.
   *
   * The audio source is controlled only by the
   * streamUrl synchronization effect below.
   */

  const audioRef = useRef(null);

  /*
   * ============================================================
   * PLAYBACK REFS
   * ============================================================
   */

  const shouldPlayRef =
    useRef(false);

  const playRequestRef =
    useRef(0);

  const playPromiseRef =
    useRef(null);

  /*
   * Used when seeking before metadata
   * becomes available.
   */

  const seekRef =
    useRef(null);

  /*
   * ============================================================
   * STATE
   * ============================================================
   */

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [currentTime, setCurrentTime] =
    useState(0);

  const [duration, setDuration] =
    useState(0);

  const [playbackError, setPlaybackError] =
    useState('');

  /*
   * ============================================================
   * VOLUME
   * ============================================================
   */

  const [volume, setVolumeState] =
    useState(() => {
      try {
        const savedVolume =
          window.localStorage.getItem(
            VOLUME_STORAGE_KEY,
          );

        if (
          savedVolume !== null
        ) {
          const parsed =
            Number(savedVolume);

          if (
            Number.isFinite(parsed) &&
            parsed >= 0 &&
            parsed <= 1
          ) {
            return parsed;
          }
        }
      } catch {
        // Ignore localStorage errors.
      }

      return initialVolume;
    });

  /*
   * ============================================================
   * NORMALIZED TRACKS
   * ============================================================
   */

  const normalizedTracks = useMemo(
    () =>
      Array.isArray(tracks)
        ? tracks.map(normalizeTrack)
        : [],
    [tracks],
  );

  /*
   * ============================================================
   * ACTIVE TRACK
   * ============================================================
   */

  const activeTrack = useMemo(() => {
    if (!currentTrack) {
      return null;
    }

    const normalizedCurrentTrack =
      normalizeTrack(currentTrack);

    const matchedTrack =
      normalizedTracks.find(
        (track) =>
          track.id ===
          normalizedCurrentTrack.id,
      );

    return (
      matchedTrack ||
      normalizedCurrentTrack
    );
  }, [
    currentTrack,
    normalizedTracks,
  ]);

  /*
   * ============================================================
   * STREAM URL
   * ============================================================
   *
   * Priority:
   *
   * 1. Explicit audioUrl
   * 2. YouTube audio endpoint
   * 3. Protected MEGA backend endpoint
   *
   * IMPORTANT:
   *
   * This URL should remain stable while the same
   * track is playing.
   *
   * Do NOT recreate it during seeking.
   */

  const streamUrl = useMemo(() => {
    if (!activeTrack) {
      return '';
    }

    if (
      activeTrack.playable === false
    ) {
      return '';
    }

    /*
     * ==========================================================
     * 1. Explicit audio URL
     * ==========================================================
     */

    if (activeTrack.audioUrl) {
      return activeTrack.audioUrl;
    }

    /*
     * ==========================================================
     * 2. YouTube
     * ==========================================================
     */

    if (
      activeTrack.source ===
        'youtube' &&
      activeTrack.youtubeId
    ) {
      const url =
        new URL(
          `${API_BASE_URL}/api/share/youtube/audio`,
        );

      url.searchParams.set(
        'id',
        activeTrack.youtubeId,
      );

      return url.toString();
    }

    /*
     * ==========================================================
     * 3. Protected backend stream
     * ==========================================================
     */

    const token =
      localStorage.getItem(
        'token',
      ) ||
      localStorage.getItem(
        'accessToken',
      );

    if (
      !token ||
      !activeTrack.id
    ) {
      return '';
    }

    const url =
      new URL(
        `${API_BASE_URL}/api/tracks/${encodeURIComponent(
          activeTrack.id,
        )}/play`,
      );

    url.searchParams.set(
      'token',
      token,
    );

    return url.toString();
  }, [
    activeTrack?.audioUrl,
    activeTrack?.id,
    activeTrack?.playable,
    activeTrack?.source,
    activeTrack?.youtubeId,
  ]);

  /*
   * ============================================================
   * PERSIST VOLUME
   * ============================================================
   */

  useEffect(() => {
    try {
      window.localStorage.setItem(
        VOLUME_STORAGE_KEY,
        String(volume),
      );
    } catch {
      // Ignore localStorage errors.
    }
  }, [volume]);

  /*
   * ============================================================
   * APPLY VOLUME TO AUDIO
   * ============================================================
   */

  useEffect(() => {
    const audio =
      audioRef.current;

    if (!audio) {
      return;
    }

    audio.volume = volume;
  }, [volume]);

  /*
   * ============================================================
   * RESET TRACK STATE
   * ============================================================
   */

  useEffect(() => {
    seekRef.current = null;

    setCurrentTime(0);

    setDuration(
      Number.isFinite(
        activeTrack?.duration,
      )
        ? activeTrack.duration
        : 0,
    );

    setPlaybackError('');

    setLoading(
      Boolean(
        activeTrack &&
          streamUrl,
      ),
    );
  }, [
    activeTrack?.id,
    activeTrack?.duration,
    streamUrl,
  ]);

  /*
   * ============================================================
   * SAFE PLAY
   * ============================================================
   */

  const safePlay =
    useCallback(async () => {
      const audio =
        audioRef.current;

      if (!audio) {
        return false;
      }

      if (!audio.src) {
        return false;
      }

      const requestId =
        ++playRequestRef.current;

      try {
        setPlaybackError('');
        setLoading(true);

        /*
         * Prevent multiple simultaneous
         * play() calls.
         */

        if (
          playPromiseRef.current
        ) {
          try {
            await playPromiseRef.current;
          } catch {
            // Ignore previous rejection.
          }
        }

        /*
         * The source is already controlled
         * by streamUrl effect.
         */

        const promise =
          audio.play();

        playPromiseRef.current =
          promise;

        if (
          promise &&
          typeof promise.then ===
            'function'
        ) {
          await promise;
        }

        /*
         * Another play/pause/track request
         * may have happened while awaiting.
         */

        if (
          requestId !==
          playRequestRef.current
        ) {
          return false;
        }

        setIsPlaying(true);
        setLoading(false);

        return true;
      } catch (error) {
        if (
          requestId !==
          playRequestRef.current
        ) {
          return false;
        }

        /*
         * AbortError is normal when
         * changing tracks quickly.
         */

        if (
          error?.name ===
          'AbortError'
        ) {
          return false;
        }

        console.error(
          '[useAudioPlayer] play() failed:',
          error,
        );

        setIsPlaying(false);
        setLoading(false);

        setPlaybackError(
          error?.message ||
            'Unable to play this track.',
        );

        return false;
      } finally {
        if (
          requestId ===
          playRequestRef.current
        ) {
          playPromiseRef.current =
            null;
        }
      }
    }, []);

  /*
   * ============================================================
   * SAFE PAUSE
   * ============================================================
   */

  const safePause =
    useCallback(() => {
      const audio =
        audioRef.current;

      if (!audio) {
        return;
      }

      /*
       * Invalidate pending play()
       * operations.
       */

      playRequestRef.current +=
        1;

      try {
        audio.pause();
      } catch (error) {
        console.warn(
          '[useAudioPlayer] pause() failed:',
          error,
        );
      }

      setIsPlaying(false);
      setLoading(false);
    }, []);

  /*
   * ============================================================
   * PLAY CURRENT TRACK
   * ============================================================
   *
   * IMPORTANT:
   *
   * This function DOES NOT:
   *
   * audio.src = ...
   * audio.load()
   *
   * because that would interfere with seeking.
   *
   * streamUrl effect owns the source.
   */

  const playCurrentTrack =
    useCallback(async () => {
      if (!activeTrack) {
        return false;
      }

      if (!streamUrl) {
        setPlaybackError(
          'This track does not have a playable audio source.',
        );

        return false;
      }

      shouldPlayRef.current =
        true;

      const audio =
        audioRef.current;

      if (!audio) {
        return false;
      }

      return safePlay();
    }, [
      activeTrack,
      streamUrl,
      safePlay,
    ]);

  /*
   * ============================================================
   * SELECT TRACK
   * ============================================================
   */

  const selectTrack =
    useCallback(
      (
        track,
        options = {},
      ) => {
        const {
          autoPlay = true,
        } = options;

        if (!track) {
          return;
        }

        const normalized =
          normalizeTrack(track);

        shouldPlayRef.current =
          autoPlay;

        setPlaybackError('');

        setCurrentTime(0);

        setDuration(
          Number.isFinite(
            normalized.duration,
          )
            ? normalized.duration
            : 0,
        );

        /*
         * The parent component changes
         * currentTrack.
         *
         * That causes streamUrl to change.
         */

        onTrackChange?.(
          normalized,
        );

        if (!autoPlay) {
          safePause();
        }
      },
      [
        onTrackChange,
        safePause,
      ],
    );

  /*
   * ============================================================
   * PLAY TRACK AT INDEX
   * ============================================================
   */

  const playTrackAt =
    useCallback(
      (index) => {
        if (
          !Number.isInteger(
            index,
          ) ||
          index < 0 ||
          index >=
            normalizedTracks.length
        ) {
          return;
        }

        const track =
          normalizedTracks[index];

        selectTrack(
          track,
          {
            autoPlay: true,
          },
        );
      },
      [
        normalizedTracks,
        selectTrack,
      ],
    );

  /*
   * ============================================================
   * TOGGLE PLAYBACK
   * ============================================================
   */

  const togglePlayback =
    useCallback(
      async () => {
        const audio =
          audioRef.current;

        if (
          !audio ||
          !activeTrack
        ) {
          return;
        }

        if (audio.paused) {
          shouldPlayRef.current =
            true;

          await playCurrentTrack();

          return;
        }

        shouldPlayRef.current =
          false;

        safePause();
      },
      [
        activeTrack,
        playCurrentTrack,
        safePause,
      ],
    );

  /*
   * ============================================================
   * VARIABLE SEEK
   * ============================================================
   *
   * User can seek to ANY second.
   *
   * Example:
   *
   * 10
   * 45
   * 120
   * 300
   * 1250
   *
   * No fixed duration.
   *
   * Browser automatically converts
   * currentTime -> HTTP Range request.
   */

  const seekTo =
    useCallback(
      (value) => {
        const audio =
          audioRef.current;

        if (!audio) {
          return;
        }

        const numericValue =
          Number(value);

        if (
          !Number.isFinite(
            numericValue,
          )
        ) {
          return;
        }

        const maxDuration =
          Number.isFinite(
            audio.duration,
          ) &&
          audio.duration > 0
            ? audio.duration
            : duration;

        const target =
          Number.isFinite(
            maxDuration,
          ) &&
          maxDuration > 0
            ? Math.max(
                0,
                Math.min(
                  numericValue,
                  maxDuration,
                ),
              )
            : Math.max(
                0,
                numericValue,
              );

        /*
         * Metadata not available yet.
         *
         * Remember target and apply it
         * after loadedmetadata.
         */

        if (
          audio.readyState <
          HTMLMediaElement.HAVE_METADATA
        ) {
          seekRef.current =
            target;

          return;
        }

        try {
          /*
           * THIS is the important line.
           *
           * Do not change src.
           * Do not call load().
           */

          audio.currentTime =
            target;

          setCurrentTime(
            target,
          );
        } catch (error) {
          seekRef.current =
            target;

          console.warn(
            '[useAudioPlayer] seek failed:',
            error,
          );
        }
      },
      [duration],
    );

  /*
   * ============================================================
   * SET VOLUME
   * ============================================================
   */

  const setVolume =
    useCallback(
      (value) => {
        const numericValue =
          Number(value);

        if (
          !Number.isFinite(
            numericValue,
          )
        ) {
          return;
        }

        const nextVolume =
          Math.max(
            0,
            Math.min(
              1,
              numericValue,
            ),
          );

        setVolumeState(
          nextVolume,
        );

        const audio =
          audioRef.current;

        if (audio) {
          audio.volume =
            nextVolume;
        }
      },
      [],
    );

  /*
   * ============================================================
   * CHECK BUFFER
   * ============================================================
   */

  const isTimeBuffered =
    useCallback(
      (time) => {
        const audio =
          audioRef.current;

        if (
          !audio ||
          !audio.buffered
        ) {
          return false;
        }

        for (
          let index = 0;
          index <
          audio.buffered.length;
          index += 1
        ) {
          const start =
            audio.buffered.start(
              index,
            );

          const end =
            audio.buffered.end(
              index,
            );

          if (
            time >= start &&
            time <= end
          ) {
            return true;
          }
        }

        return false;
      },
      [],
    );

  /*
   * ============================================================
   * AUDIO EVENTS
   * ============================================================
   */

  const handleLoadStart =
    useCallback(() => {
      setLoading(true);
    }, []);

  /*
   * ============================================================
   * LOADED METADATA
   * ============================================================
   */

  const handleLoadedMetadata =
    useCallback(() => {
      const audio =
        audioRef.current;

      if (!audio) {
        return;
      }

      /*
       * Get REAL duration from
       * browser media metadata.
       */

      if (
        Number.isFinite(
          audio.duration,
        ) &&
        audio.duration > 0
      ) {
        setDuration(
          audio.duration,
        );
      }

      /*
       * Apply pending seek.
       */

      if (
        seekRef.current !==
        null
      ) {
        const target =
          seekRef.current;

        seekRef.current =
          null;

        try {
          audio.currentTime =
            target;

          setCurrentTime(
            target,
          );
        } catch {
          seekRef.current =
            target;
        }
      }
    }, []);

  /*
   * ============================================================
   * CAN PLAY
   * ============================================================
   */

  const handleCanPlay =
    useCallback(() => {
      setLoading(false);
    }, []);

  const handleCanPlayThrough =
    useCallback(() => {
      setLoading(false);
    }, []);

  /*
   * ============================================================
   * BUFFERING
   * ============================================================
   */

  const handleWaiting =
    useCallback(() => {
      setLoading(true);
    }, []);

  const handleStalled =
    useCallback(() => {
      /*
       * Do not treat stalled as
       * permanent playback failure.
       */

      setLoading(true);
    }, []);

  const handleProgress =
    useCallback(() => {
      /*
       * Intentionally lightweight.
       *
       * Use audio.buffered through
       * isTimeBuffered().
       */
    }, []);

  /*
   * ============================================================
   * PLAYING
   * ============================================================
   */

  const handlePlaying =
    useCallback(() => {
      setLoading(false);
      setIsPlaying(true);
      setPlaybackError('');
    }, []);

  const handlePlay =
    useCallback(() => {
      setIsPlaying(true);
    }, []);

  /*
   * ============================================================
   * PAUSE
   * ============================================================
   */

  const handlePause =
    useCallback(() => {
      const audio =
        audioRef.current;

      if (!audio) {
        return;
      }

      /*
       * Ignore pause generated by
       * natural track ending.
       */

      if (audio.ended) {
        return;
      }

      setIsPlaying(false);
    }, []);

  /*
   * ============================================================
   * TIME UPDATE
   * ============================================================
   */

  const handleTimeUpdate =
    useCallback(() => {
      const audio =
        audioRef.current;

      if (!audio) {
        return;
      }

      if (
        Number.isFinite(
          audio.currentTime,
        )
      ) {
        setCurrentTime(
          audio.currentTime,
        );
      }
    }, []);

  /*
   * ============================================================
   * TRACK ENDED
   * ============================================================
   */

  const handleEnded =
    useCallback(() => {
      const audio =
        audioRef.current;

      if (audio) {
        setCurrentTime(
          Number.isFinite(
            audio.duration,
          )
            ? audio.duration
            : currentTime,
        );
      }

      setIsPlaying(false);
      setLoading(false);

      shouldPlayRef.current =
        false;

      onTrackEnded?.(
        activeTrack,
      );
    }, [
      activeTrack,
      currentTime,
      onTrackEnded,
    ]);

  /*
   * ============================================================
   * AUDIO ERROR
   * ============================================================
   */

  const handleError =
    useCallback(() => {
      const audio =
        audioRef.current;

      if (!audio) {
        return;
      }

      const mediaError =
        audio.error;

      let message =
        'Unable to play this audio.';

      if (mediaError) {
        switch (
          mediaError.code
        ) {
          case MediaError.MEDIA_ERR_ABORTED:
            message =
              'Audio playback was aborted.';
            break;

          case MediaError.MEDIA_ERR_NETWORK:
            message =
              'A network error occurred while loading the audio.';
            break;

          case MediaError.MEDIA_ERR_DECODE:
            message =
              'The audio format could not be decoded.';
            break;

          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            message =
              'This audio source is not supported.';
            break;

          default:
            message =
              'Unable to play this audio.';
        }
      }

      console.error(
        '[useAudioPlayer] audio error:',
        {
          message,
          code:
            mediaError?.code,
          source: audio.src,
          track: activeTrack,
        },
      );

      setLoading(false);
      setIsPlaying(false);
      setPlaybackError(
        message,
      );
    }, [
      activeTrack,
    ]);

  /*
   * ============================================================
   * SOURCE SYNCHRONIZATION
   * ============================================================
   *
   * THIS IS THE ONLY PLACE WHERE audio.src
   * IS CHANGED.
   *
   * This is the most important frontend fix.
   */

  useEffect(() => {
    const audio =
      audioRef.current;

    if (!audio) {
      return;
    }

    /*
     * ==========================================================
     * No source
     * ==========================================================
     */

    if (!streamUrl) {
      shouldPlayRef.current =
        false;

      playRequestRef.current +=
        1;

      try {
        audio.pause();

        audio.removeAttribute(
          'src',
        );

        audio.load();
      } catch {
        // Ignore cleanup errors.
      }

      setIsPlaying(false);
      setLoading(false);

      return;
    }

    /*
     * ==========================================================
     * Same source
     * ==========================================================
     *
     * IMPORTANT:
     *
     * If the user seeks, streamUrl does NOT change.
     *
     * Therefore this returns immediately.
     *
     * No:
     *
     * audio.src = ...
     * audio.load()
     *
     */

    if (
      audio.src ===
      streamUrl
    ) {
      return;
    }

    /*
     * ==========================================================
     * New source / new track
     * ==========================================================
     */

    shouldPlayRef.current =
      true;

    playRequestRef.current +=
      1;

    try {
      audio.pause();
    } catch {
      // Ignore pause errors.
    }

    setIsPlaying(false);
    setLoading(true);
    setPlaybackError('');

    /*
     * ==========================================================
     * ONLY SOURCE ASSIGNMENT
     * ==========================================================
     */

    audio.src =
      streamUrl;

    try {
      audio.load();
    } catch (error) {
      console.error(
        '[useAudioPlayer] audio.load() failed:',
        error,
      );

      setLoading(false);

      setPlaybackError(
        'Unable to load this audio source.',
      );
    }
  }, [
    streamUrl,
  ]);

  /*
   * ============================================================
   * AUTO PLAY NEW TRACK
   * ============================================================
   */

  useEffect(() => {
    if (!streamUrl) {
      return;
    }

    if (
      !shouldPlayRef.current
    ) {
      return;
    }

    const audio =
      audioRef.current;

    if (!audio) {
      return;
    }

    let cancelled =
      false;

    const startPlayback =
      async () => {
        /*
         * Wait for metadata if
         * necessary.
         */

        if (
          audio.readyState <
          HTMLMediaElement.HAVE_METADATA
        ) {
          await new Promise(
            (resolve) => {
              let resolved =
                false;

              const finish =
                () => {
                  if (resolved) {
                    return;
                  }

                  resolved =
                    true;

                  window.clearTimeout(
                    timeout,
                  );

                  audio.removeEventListener(
                    'loadedmetadata',
                    onMetadata,
                  );

                  resolve();
                };

              const timeout =
                window.setTimeout(
                  finish,
                  1000,
                );

              const onMetadata =
                () => {
                  finish();
                };

              audio.addEventListener(
                'loadedmetadata',
                onMetadata,
                {
                  once: true,
                },
              );
            },
          );
        }

        if (cancelled) {
          return;
        }

        if (
          !shouldPlayRef.current
        ) {
          return;
        }

        await safePlay();
      };

    startPlayback();

    return () => {
      cancelled = true;
    };
  }, [
    streamUrl,
    safePlay,
  ]);

  /*
   * ============================================================
   * RESET SEEK STATE WHEN TRACK CHANGES
   * ============================================================
   */

  useEffect(() => {
    seekRef.current =
      null;
  }, [
    activeTrack?.id,
  ]);

  /*
   * ============================================================
   * CLEANUP
   * ============================================================
   */

  useEffect(() => {
    return () => {
      shouldPlayRef.current =
        false;

      playRequestRef.current +=
        1;

      const audio =
        audioRef.current;

      if (!audio) {
        return;
      }

      try {
        audio.pause();

        audio.removeAttribute(
          'src',
        );

        audio.load();
      } catch {
        // Ignore cleanup errors.
      }
    };
  }, []);

  /*
   * ============================================================
   * AUDIO ELEMENT PROPS
   * ============================================================
   *
   * IMPORTANT:
   *
   * DO NOT put:
   *
   * src: streamUrl
   *
   * here.
   *
   * The source synchronization effect above
   * is the single owner of audio.src.
   */

  const audioProps =
    useMemo(
      () => ({
        ref: audioRef,

        preload: 'auto',

        onLoadStart:
          handleLoadStart,

        onLoadedMetadata:
          handleLoadedMetadata,

        onCanPlay:
          handleCanPlay,

        onCanPlayThrough:
          handleCanPlayThrough,

        onWaiting:
          handleWaiting,

        onStalled:
          handleStalled,

        onProgress:
          handleProgress,

        onPlaying:
          handlePlaying,

        onPlay:
          handlePlay,

        onPause:
          handlePause,

        onTimeUpdate:
          handleTimeUpdate,

        onEnded:
          handleEnded,

        onError:
          handleError,

        /*
         * Custom player UI.
         */

        controls: false,
      }),
      [
        handleLoadStart,
        handleLoadedMetadata,
        handleCanPlay,
        handleCanPlayThrough,
        handleWaiting,
        handleStalled,
        handleProgress,
        handlePlaying,
        handlePlay,
        handlePause,
        handleTimeUpdate,
        handleEnded,
        handleError,
      ],
    );

  /*
   * ============================================================
   * PROGRESS MAX
   * ============================================================
   *
   * Actual browser duration has priority.
   *
   * Fallback to track metadata.
   */

  const progressMax =
    useMemo(() => {
      if (
        Number.isFinite(
          duration,
        ) &&
        duration > 0
      ) {
        return duration;
      }

      if (
        Number.isFinite(
          activeTrack?.duration,
        ) &&
        activeTrack.duration > 0
      ) {
        return activeTrack.duration;
      }

      return 0;
    }, [
      duration,
      activeTrack?.duration,
    ]);

  /*
   * ============================================================
   * PROGRESS VALUE
   * ============================================================
   */

  const progressValue =
    useMemo(() => {
      if (
        !Number.isFinite(
          currentTime,
        )
      ) {
        return 0;
      }

      if (
        Number.isFinite(
          progressMax,
        ) &&
        progressMax > 0
      ) {
        return Math.max(
          0,
          Math.min(
            currentTime,
            progressMax,
          ),
        );
      }

      return Math.max(
        0,
        currentTime,
      );
    }, [
      currentTime,
      progressMax,
    ]);

  /*
   * ============================================================
   * RETURN API
   * ============================================================
   */

  return {
    /*
     * Audio element
     */

    audioProps,

    /*
     * Track
     */

    activeTrack,

    /*
     * Playback
     */

    isPlaying,
    loading,
    playbackError,

    /*
     * Time
     */

    currentTime,
    duration,
    progressMax,
    progressValue,

    /*
     * Volume
     */

    volume,
    setVolume,

    /*
     * Source
     */

    streamUrl,

    /*
     * Actions
     */

    selectTrack,
    playTrackAt,
    playCurrentTrack,
    togglePlayback,
    seekTo,

    /*
     * Utility
     */

    isTimeBuffered,

    /*
     * Compatibility
     */

    setPlaybackError,
    setIsPlaying,
  };
}