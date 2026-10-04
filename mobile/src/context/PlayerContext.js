import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { AppState, Platform } from 'react-native';

import {
    createAudioPlayer,
    requestNotificationPermissionsAsync,
    setAudioModeAsync,
} from 'expo-audio';

import { API_BASE_URL, normalizeRemoteUrl, tracksApi } from '../lib/api';
import { useStore } from '../store/store';
import { normalizeTrack } from '../utils/track';


const PlayerContext = createContext(null);

const PLAYER_KEY = 'mega_music_player';
const PLAYER_SETTINGS_KEY = 'mega_music_player_settings';
const repeatModes = new Set(['off', 'all', 'one']);
const isExpoGo = Boolean(
    Constants &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient &&
    Constants.expoGoConfig
);
const supportsBackgroundPlayback = Platform.OS !== 'web' && !isExpoGo;
const playerSingletonRef = { current: null };
const playbackListenerRef = { current: null };
const appStateListenerRef = { current: null };
let notificationPermissionRequested = false;

function requestPlaybackNotificationPermission() {
    if (
        Platform.OS !== 'android' ||
        !supportsBackgroundPlayback ||
        notificationPermissionRequested
    ) {
        return;
    }

    notificationPermissionRequested = true;
    requestNotificationPermissionsAsync().catch(() => {
        notificationPermissionRequested = false;
    });
}

function loadVolumeManager() {
    if (Platform.OS === 'web' || isExpoGo) {
        return null;
    }

    try {
        return require('react-native-volume-manager').VolumeManager;
    } catch {
        return null;
    }
}

const normalizeVolume = (value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue)
        ? Math.max(0, Math.min(1, numericValue))
        : 1;
};



const getValidArtworkUrl = (value, token) => {
    if (!value || typeof value !== 'string') {
        return undefined;
    }

    const url = normalizeRemoteUrl(value);

    if (!url) {
        return undefined;
    }

    try {
        const parsed = new URL(url);

        if (
            parsed.protocol !== 'http:' &&
            parsed.protocol !== 'https:'
        ) {
            return undefined;
        }

        if (
            token &&
            parsed.origin === new URL(API_BASE_URL).origin &&
            parsed.pathname.includes('/api/tracks/') &&
            parsed.pathname.endsWith('/cover')
        ) {
            parsed.searchParams.set('token', token);
        }

        return parsed.toString();
    } catch {
        return undefined;
    }
};


export function PlayerProvider({ children, token }) {

    /* ------------------------------------------------------------------------ */
    /* Player refs                                                              */
    /* ------------------------------------------------------------------------ */

    const playerRef = useRef(null);
    const volumeManagerRef = useRef(null);
    const mountedRef = useRef(false);
    const initializingRef = useRef(false);
    const settingsHydratedRef = useRef(false);
    const settingsTouchedRef = useRef(false);
    const systemVolumeKnownRef = useRef(false);
    const restoredPlaybackRef = useRef(false);
    const savedPlaybackRef = useRef(null);
    const pendingRestoreSeekRef = useRef(null);
    const volumeRef = useRef(1);
    const settingsRef = useRef({ volume: 1, repeat: 'off', shuffle: false });
    const playbackSnapshotRef = useRef(null);
    const playbackSaveTimerRef = useRef(null);
    const settingsSaveTimerRef = useRef(null);

    const queueRef = useRef([]);
    const handleNextRef = useRef(() => {});


    /* ------------------------------------------------------------------------ */
    /* State                                                                    */
    /* ------------------------------------------------------------------------ */

    const [queue, setQueue] = useState([]);
    const [index, setIndex] = useState(0);
    const [activeTrack, setActiveTrack] = useState(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);

    const [volume, setVolume] = useState(1);
    const [playerReady, setPlayerReady] = useState(false);
    const [deviceVolumeAvailable, setDeviceVolumeAvailable] = useState(false);

    const [repeat, setRepeat] = useState('off');
    const [shuffle, setShuffle] = useState(false);

    const [error, setError] = useState('');

    const handlePlaybackStatus = useCallback((status) => {
        if (!mountedRef.current) {
            return;
        }

        setIsPlaying(Boolean(status?.playing));
        setPosition(Number(status?.currentTime) || 0);
        setDuration(Number(status?.duration) || 0);

        if (pendingRestoreSeekRef.current !== null && status?.isLoaded) {
            const requestedPosition = pendingRestoreSeekRef.current;
            const actualDuration = Number(status?.duration) || 0;
            const target = actualDuration > 0
                ? Math.min(requestedPosition, actualDuration)
                : requestedPosition;

            pendingRestoreSeekRef.current = null;
            setPosition(target);
            playerRef.current?.seekTo(target).catch(() => {});
        }

        if (status?.didJustFinish && queueRef.current.length > 0) {
            handleNextRef.current();
        }
    }, []);

    const schedulePlaybackSave = useCallback((flush = false) => {
        if (!playbackSnapshotRef.current?.activeTrack) {
            return;
        }

        if (playbackSaveTimerRef.current) {
            if (!flush) {
                return;
            }
            clearTimeout(playbackSaveTimerRef.current);
        }

        playbackSaveTimerRef.current = setTimeout(() => {
            playbackSaveTimerRef.current = null;
            const snapshot = playbackSnapshotRef.current;

            if (snapshot?.activeTrack) {
                AsyncStorage.setItem(PLAYER_KEY, JSON.stringify(snapshot)).catch(() => {});
            }
        }, flush ? 0 : 1200);
    }, []);

    const scheduleSettingsSave = useCallback((flush = false) => {
        if (!settingsHydratedRef.current) {
            return;
        }

        if (settingsSaveTimerRef.current) {
            if (!flush) {
                return;
            }
            clearTimeout(settingsSaveTimerRef.current);
        }

        settingsSaveTimerRef.current = setTimeout(() => {
            settingsSaveTimerRef.current = null;
            AsyncStorage.setItem(
                PLAYER_SETTINGS_KEY,
                JSON.stringify(settingsRef.current)
            ).catch(() => {});
        }, flush ? 0 : 400);
    }, []);


    /* ------------------------------------------------------------------------ */
    /* Keep queue ref synchronized                                              */
    /* ------------------------------------------------------------------------ */

    useEffect(() => {
        queueRef.current = queue;
    }, [queue]);

    useEffect(() => {
        volumeRef.current = volume;
        settingsRef.current = { volume, repeat, shuffle };

        if (settingsHydratedRef.current) {
            scheduleSettingsSave();
        }
    }, [volume, repeat, shuffle, scheduleSettingsSave]);

    useEffect(() => {
        playbackSnapshotRef.current = {
            activeTrack,
            queue,
            index,
            position,
        };

        if (activeTrack) {
            schedulePlaybackSave();
        }
    }, [activeTrack, queue, index, position, schedulePlaybackSave]);

    useEffect(() => {
        if (appStateListenerRef.current) {
            return undefined;
        }

        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                return;
            }

            schedulePlaybackSave(true);
            scheduleSettingsSave(true);
        });

        appStateListenerRef.current = subscription;

        return () => {
            if (!appStateListenerRef.current) {
                return;
            }

            try {
                appStateListenerRef.current.remove();
            } catch {
                // Ignore listener cleanup errors.
            }

            appStateListenerRef.current = null;
        };
    }, [schedulePlaybackSave, scheduleSettingsSave]);


    /* ------------------------------------------------------------------------ */
    /* Audio initialization                                                     */
    /* ------------------------------------------------------------------------ */

    useEffect(() => {
        let subscription = null;
        let player = playerSingletonRef.current;

        mountedRef.current = true;

        const detachUiListeners = () => {
            mountedRef.current = false;
            schedulePlaybackSave(true);
            scheduleSettingsSave(true);

            try {
                subscription?.remove?.();
            } catch {
                // Ignore subscription cleanup errors.
            }

            if (playbackListenerRef.current === subscription) {
                playbackListenerRef.current = null;
            }

            playerRef.current = playerSingletonRef.current;
        };

        const attachPlaybackListener = () => {
            try {
                playbackListenerRef.current?.remove?.();
            } catch {
                // Ignore stale listener cleanup errors.
            }

            subscription = player.addListener(
                'playbackStatusUpdate',
                handlePlaybackStatus
            );
            playbackListenerRef.current = subscription;
        };

        if (player) {
            playerRef.current = player;
            attachPlaybackListener();
            setIsPlaying(Boolean(player.playing));
            setPosition(Number(player.currentTime) || 0);
            setDuration(Number(player.duration) || 0);
            setPlayerReady(true);
            return detachUiListeners;
        }


        const initializeAudio = async () => {

            if (initializingRef.current) {
                return;
            }

            initializingRef.current = true;

            try {

                let savedSettings = null;
                let savedPlayback = null;

                try {
                    const [settingsValue, playbackValue] = await Promise.all([
                        AsyncStorage.getItem(PLAYER_SETTINGS_KEY),
                        AsyncStorage.getItem(PLAYER_KEY),
                    ]);

                    savedSettings = settingsValue ? JSON.parse(settingsValue) : null;
                    savedPlayback = playbackValue ? JSON.parse(playbackValue) : null;
                } catch {
                    savedSettings = null;
                    savedPlayback = null;
                }

                if (savedSettings) {
                    const restoredVolume = settingsTouchedRef.current || systemVolumeKnownRef.current
                        ? volumeRef.current
                        : normalizeVolume(savedSettings.volume);
                    const restoredRepeat = repeatModes.has(savedSettings.repeat)
                        ? savedSettings.repeat
                        : 'off';
                    const restoredShuffle = Boolean(savedSettings.shuffle);

                    volumeRef.current = restoredVolume;
                    settingsRef.current = {
                        volume: restoredVolume,
                        repeat: restoredRepeat,
                        shuffle: restoredShuffle,
                    };
                    setVolume(restoredVolume);

                    if (!settingsTouchedRef.current) {
                        setRepeat(restoredRepeat);
                        setShuffle(restoredShuffle);
                    }
                }

                settingsHydratedRef.current = true;
                scheduleSettingsSave();
                savedPlaybackRef.current = savedPlayback;

                /*
                 * Configure the audio session FIRST.
                 *
                 * This must finish before creating/activating the
                 * background playback player.
                 */

                await setAudioModeAsync({
                    playsInSilentMode: true,
                    shouldPlayInBackground: supportsBackgroundPlayback,
                    interruptionMode: 'doNotMix',
                });


                if (!mountedRef.current) {
                    return;
                }


                /*
                 * Create the player only after the audio mode
                 * has been configured successfully.
                 */

                player = createAudioPlayer(null, {
                    updateInterval: 250,
                    preferredForwardBufferDuration: 15,
                });

                playerSingletonRef.current = player;
                playerRef.current = player;
                player.volume = volumeRef.current;

                attachPlaybackListener();
                setPlayerReady(true);


            } catch (error) {

                console.error(
                    '[Player] Audio initialization failed:',
                    error
                );


                if (mountedRef.current) {

                    setError(
                        error?.message ||
                        'Audio initialization failed.'
                    );

                }

            } finally {

                initializingRef.current = false;

            }

        };


        initializeAudio();


        /* ---------------------------------------------------------------------- */
        /* Cleanup                                                                */
        /* ---------------------------------------------------------------------- */

        return () => {
            detachUiListeners();
        };

    }, [handlePlaybackStatus, schedulePlaybackSave, scheduleSettingsSave]);


    /* ------------------------------------------------------------------------ */
    /* Source resolver                                                          */
    /* ------------------------------------------------------------------------ */

    const sourceFor = useCallback(
        (track) => {
            return tracksApi.streamUrl(track, token);
        },
        [token]
    );

    useEffect(() => {
        if (!playerReady || !token || restoredPlaybackRef.current) {
            return;
        }

        const player = playerRef.current;
        const saved = savedPlaybackRef.current;

        if (!player || !saved) {
            restoredPlaybackRef.current = true;
            return;
        }

        const availableTracks = useStore.getState().tracks;
        const savedTrack = saved.activeTrack || availableTracks.find(
            (track) => String(track.id) === String(saved.id)
        );
        const restoredTrack = savedTrack ? normalizeTrack(savedTrack) : null;

        if (!restoredTrack?.id) {
            restoredPlaybackRef.current = true;
            return;
        }

        const restoredQueue = Array.isArray(saved.queue)
            ? saved.queue.map(normalizeTrack).filter((track) => track?.id)
            : [];
        const activeIndex = restoredQueue.findIndex(
            (track) => String(track.id) === String(restoredTrack.id)
        );

        if (activeIndex < 0) {
            restoredQueue.push(restoredTrack);
        }

        const nextIndex = activeIndex < 0
            ? restoredQueue.length - 1
            : activeIndex;
        const source = sourceFor(restoredTrack);

        if (!source) {
            restoredPlaybackRef.current = true;
            return;
        }

        restoredPlaybackRef.current = true;
        queueRef.current = restoredQueue;
        setQueue(restoredQueue);
        setIndex(nextIndex);
        setActiveTrack(restoredTrack);
        setIsPlaying(false);
        setPosition(Math.max(0, Number(saved.position) || 0));
        setDuration(0);
        player.volume = volumeRef.current;
        player.replace(source);

        const savedPosition = Math.max(0, Number(saved.position) || 0);
        if (savedPosition > 0) {
            pendingRestoreSeekRef.current = savedPosition;
        }
    }, [playerReady, token, sourceFor]);


    /* ------------------------------------------------------------------------ */
    /* Lock-screen metadata                                                     */
    /* ------------------------------------------------------------------------ */

    const activateLockScreen = useCallback(
    (track) => {
        const player = playerRef.current;

        if (!supportsBackgroundPlayback || !player || !track) {
            return;
        }

        try {
            const artworkUrl = getValidArtworkUrl(
                track.thumbnailUrl,
                token
            );

            const metadata = {
                title: track.title || 'Unknown Title',
                artist: track.artist || 'Unknown Artist',
                albumTitle: track.album || 'MEGA Music',
            };

            /*
             * Only send artworkUrl when it is a valid
             * absolute HTTP/HTTPS URL.
             */
            if (artworkUrl) {
                metadata.artworkUrl = artworkUrl;
            }

            player.setActiveForLockScreen(
                true,
                metadata,
                {
                    isLiveStream: true,
                    showSeekBackward: false,
                    showSeekForward: false,
                }
            );
        } catch (error) {
            /*
             * Lock-screen metadata must never stop
             * normal audio playback.
             */
            console.warn(
                '[Player] Lock-screen controls unavailable:',
                error?.message || error
            );
        }
    },
    [token]
);


    /* ------------------------------------------------------------------------ */
    /* Play                                                                     */
    /* ------------------------------------------------------------------------ */

    const play = useCallback(
        async (track, tracks = [track]) => {

            const player = playerRef.current;

            if (!player) {

                setError(
                    'Audio player is still initializing. Please try again.'
                );

                return;
            }


            const normalized = tracks
                .map(normalizeTrack)
                .filter(Boolean);


            const playableQueue = normalized.filter(
                (item) =>
                    item?.playable &&
                    sourceFor(item)
            );


            const nextIndex = playableQueue.findIndex(
                (item) =>
                    String(item.id) === String(track.id)
            );


            if (
                nextIndex < 0 ||
                !playableQueue.length
            ) {

                setError(
                    'This track cannot be played.'
                );

                return;
            }


            try {

                setError('');
                requestPlaybackNotificationPermission();


                const selectedTrack =
                    playableQueue[nextIndex];


                const source =
                    sourceFor(selectedTrack);


                setQueue(playableQueue);

                queueRef.current = playableQueue;

                setIndex(nextIndex);

                setActiveTrack(selectedTrack);
                setPosition(0);
                setDuration(0);
                restoredPlaybackRef.current = true;
                pendingRestoreSeekRef.current = null;


                /*
                 * Replace source.
                 */

                player.replace(source);


                /*
                 * Restore current volume.
                 */

                player.volume = volumeRef.current;


                /*
                 * Activate lock-screen/media controls
                 * after the player has been created.
                 */

                activateLockScreen(
                    selectedTrack
                );


                /*
                 * Start playback.
                 */

                player.play();


            } catch (error) {

                console.error(
                    '[Player] Playback failed:',
                    error
                );


                setError(
                    error?.message ||
                    'Playback could not start.'
                );

            }

        },
        [
            sourceFor,
            activateLockScreen,
        ]
    );


    /* ------------------------------------------------------------------------ */
    /* Next                                                                     */
    /* ------------------------------------------------------------------------ */

    const next = useCallback(
        async () => {

            const player = playerRef.current;
            const currentQueue = queueRef.current;


            if (
                !player ||
                !currentQueue.length
            ) {
                return;
            }


            let nextIndex;


            if (shuffle) {

                nextIndex = Math.floor(
                    Math.random() * currentQueue.length
                );

            } else {

                nextIndex = index + 1;

            }


            if (nextIndex >= currentQueue.length) {

                if (repeat === 'all') {

                    nextIndex = 0;

                } else {

                    return;
                }

            }


            const nextTrack =
                currentQueue[nextIndex];


            if (!nextTrack) {
                return;
            }


            setIndex(nextIndex);

            setActiveTrack(nextTrack);
            setPosition(0);
            setDuration(0);
            pendingRestoreSeekRef.current = null;


            try {

                player.replace(
                    sourceFor(nextTrack)
                );


                activateLockScreen(
                    nextTrack
                );


                player.play();


            } catch (error) {

                setError(
                    error?.message ||
                    'Next track failed.'
                );

            }

        },
        [
            index,
            shuffle,
            repeat,
            sourceFor,
            activateLockScreen,
        ]
    );


    useEffect(() => {

        handleNextRef.current = next;

    }, [next]);


    /* ------------------------------------------------------------------------ */
    /* Previous                                                                 */
    /* ------------------------------------------------------------------------ */

    const previous = useCallback(
        () => {

            const player = playerRef.current;
            const currentQueue = queueRef.current;


            if (
                !player ||
                !currentQueue.length
            ) {
                return;
            }


            let previousIndex = index - 1;

            if (previousIndex < 0) {
                if (repeat === 'all') {
                    previousIndex = currentQueue.length - 1;
                } else {
                    return;
                }
            }


            const previousTrack =
                currentQueue[previousIndex];


            if (!previousTrack) {
                return;
            }


            setIndex(previousIndex);

            setActiveTrack(previousTrack);
            setPosition(0);
            setDuration(0);
            pendingRestoreSeekRef.current = null;


            try {

                player.replace(
                    sourceFor(previousTrack)
                );


                activateLockScreen(
                    previousTrack
                );


                player.play();


            } catch (error) {

                setError(
                    error?.message ||
                    'Previous track failed.'
                );

            }

        },
        [
            index,
            repeat,
            sourceFor,
            activateLockScreen,
        ]
    );


    /* ------------------------------------------------------------------------ */
    /* Toggle play/pause                                                        */
    /* ------------------------------------------------------------------------ */

    const toggle = useCallback(
        () => {

            const player = playerRef.current;

            if (!player) {
                return;
            }


            try {

                if (isPlaying) {

                    player.pause();

                } else {

                    player.play();

                }

            } catch (error) {

                setError(
                    error?.message ||
                    'Unable to change playback state.'
                );

            }

        },
        [isPlaying]
    );


    /* ------------------------------------------------------------------------ */
    /* Seek                                                                     */
    /* ------------------------------------------------------------------------ */

    const seek = useCallback(
        (value) => {

            const player = playerRef.current;

            if (!player) {
                return;
            }


            /*
             * Convert the slider value to a number.
             */

            const requestedTime = Number(value);


            /*
             * Ignore invalid values.
             */

            if (!Number.isFinite(requestedTime)) {
                return;
            }


            /*
             * Never allow a negative position.
             */

            let target = Math.max(
                0,
                requestedTime
            );


            /*
             * If the native player already knows the duration,
             * clamp the target to the real track duration.
             *
             * This allows arbitrary seeking:
             *
             * 0:05
             * 0:42
             * 2:17
             * 8:43
             * 25:30
             * 1:05:00
             * etc.
             */

            const currentDuration =
                Number(duration);


            if (
                Number.isFinite(currentDuration) &&
                currentDuration > 0
            ) {

                target = Math.min(
                    target,
                    currentDuration
                );

            }


            try {

                /*
                 * IMPORTANT:
                 *
                 * Do NOT call player.replace() here.
                 *
                 * Seeking must keep the existing source and simply
                 * move the native player's playback position.
                 */

                player.seekTo(target);


                /*
                 * Update React immediately.
                 *
                 * playbackStatusUpdate will continue to provide the
                 * authoritative native position afterward.
                 */

                setPosition(target);

                setError('');


            } catch (error) {

                console.warn(
                    '[Player] Seek failed:',
                    error?.message || error
                );


                setError(
                    error?.message ||
                    'Unable to seek in this track.'
                );

            }

        },
        [duration]
    );


    /* ------------------------------------------------------------------------ */
    /* Volume                                                                   */
    /* ------------------------------------------------------------------------ */

    const changeVolume = useCallback(
        (value, { syncDevice = true, fromSystem = false } = {}) => {

            const numericValue = Number(value);


            const nextVolume =
                normalizeVolume(numericValue);


            if (!fromSystem) {
                settingsTouchedRef.current = true;
            }
            volumeRef.current = nextVolume;
            setVolume(nextVolume);
            settingsRef.current = {
                ...settingsRef.current,
                volume: nextVolume,
            };
            scheduleSettingsSave();


            if (playerRef.current) {

                playerRef.current.volume =
                    nextVolume;

            }

            if (syncDevice && volumeManagerRef.current) {
                volumeManagerRef.current.setVolume(nextVolume, {
                    type: 'music',
                    showUI: false,
                    playSound: false,
                }).catch(() => {});
            }

        },
        [scheduleSettingsSave]
    );

    useEffect(() => {
        const volumeManager = loadVolumeManager();

        if (!volumeManager) {
            return undefined;
        }

        let active = true;
        volumeManagerRef.current = volumeManager;
        setDeviceVolumeAvailable(true);

        const subscription = volumeManager.addVolumeListener(({ volume: nextVolume }) => {
            if (!active || !Number.isFinite(Number(nextVolume))) {
                return;
            }

            systemVolumeKnownRef.current = true;
            const normalizedVolume = normalizeVolume(nextVolume);

            if (Math.abs(volumeRef.current - normalizedVolume) > 0.005) {
                changeVolume(normalizedVolume, {
                    syncDevice: false,
                    fromSystem: true,
                });
            }
        });

        volumeManager.getVolume()
            .then(({ volume: currentVolume }) => {
                if (!active) {
                    return;
                }

                systemVolumeKnownRef.current = true;
                changeVolume(currentVolume, {
                    syncDevice: false,
                    fromSystem: true,
                });
            })
            .catch(() => {
                if (active) {
                    setDeviceVolumeAvailable(false);
                }
            });

        return () => {
            active = false;
            subscription.remove();
            volumeManagerRef.current = null;
            setDeviceVolumeAvailable(false);
        };
    }, [changeVolume]);


    /* ------------------------------------------------------------------------ */
    /* Repeat                                                                   */
    /* ------------------------------------------------------------------------ */

    const cycleRepeat = useCallback(
        () => {

            setRepeat(
                (current) => {

                    if (current === 'off') {
                        return 'all';
                    }


                    if (current === 'all') {
                        return 'one';
                    }


                    return 'off';

                }
            );

        },
        []
    );


    /* ------------------------------------------------------------------------ */
    /* Loop                                                                     */
    /* ------------------------------------------------------------------------ */

    useEffect(() => {

        if (!playerRef.current) {
            return;
        }


        playerRef.current.loop =
            repeat === 'one' &&
            Boolean(activeTrack);


    }, [repeat, activeTrack]);


    /* ------------------------------------------------------------------------ */
    /* Context value                                                            */
    /* ------------------------------------------------------------------------ */  
    const value = useMemo(
  () => ({
    token,

    activeTrack,
    isPlaying,
    position,
    duration,
    volume,
    queue,
    index,
    repeat,
    shuffle,
    error,

    play,
    toggle,
    seek,
    next,
    previous,
    cycleRepeat,

    setShuffle: () =>
      setShuffle((value) => !value),

    setVolume: changeVolume,
        deviceVolumeAvailable,
  }),
  [
    token,

    activeTrack,
    isPlaying,
    position,
    duration,
    volume,
    queue,
    index,
    repeat,
    shuffle,
    error,
    deviceVolumeAvailable,

    play,
    toggle,
    seek,
    next,
    previous,
    cycleRepeat,
    changeVolume,
  ]
);


    return (
        <PlayerContext.Provider
            value={value}
        >
            {children}
        </PlayerContext.Provider>
    );

}


/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

export function usePlayer() {

    const context =
        useContext(PlayerContext);


    if (!context) {

        throw new Error(
            'usePlayer must be used inside PlayerProvider'
        );

    }


    return context;
}
