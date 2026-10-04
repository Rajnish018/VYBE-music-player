import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import {
    useNavigate,
    useParams,
} from 'react-router-dom';

import { createPortal } from 'react-dom';

import Icon from '../../components/Icons';
import CoverImage from '../../components/CoverImage';

import publicArtistsApi from '../../api/publicArtistsApi';

import {
    normalizeArtistName,
} from '../../utils/artistUtils';

import './ArtistDetail.css';


/* =========================================================
   HELPERS
========================================================= */

function getApiOrigin() {
    const configuredUrl =
        import.meta.env.VITE_API_URL;

    if (
        typeof configuredUrl === 'string' &&
        configuredUrl.trim()
    ) {
        return configuredUrl
            .trim()
            .replace(/\/api\/?$/, '')
            .replace(/\/$/, '');
    }

    /*
     * Development fallback.
     *
     * Your backend is currently running on port 3000.
     */
    return 'http://localhost:3000';
}


/*
 * Artist images are stored by the backend under:
 *
 * /uploads/artists/filename.jpg
 *
 * The browser must request them from the backend,
 * not from the Vite frontend server.
 */
function normalizeArtistCoverUrl(value) {
    if (
        typeof value !== 'string' ||
        !value.trim()
    ) {
        return '';
    }

    const url = value.trim();

    /*
     * Already absolute.
     */
    if (
        url.startsWith('http://') ||
        url.startsWith('https://') ||
        url.startsWith('blob:') ||
        url.startsWith('data:')
    ) {
        return url;
    }

    const apiOrigin = getApiOrigin();

    /*
     * Backend stored:
     *
     * /uploads/artists/example.jpg
     */
    if (url.startsWith('/')) {
        return `${apiOrigin}${url}`;
    }

    /*
     * Backend may return:
     *
     * uploads/artists/example.jpg
     */
    return `${apiOrigin}/${url}`;
}


/*
 * Handle different response shapes returned by
 * the API.
 */
function extractArtistsFromResponse(response) {
    if (Array.isArray(response)) {
        return response;
    }

    if (
        Array.isArray(response?.artists)
    ) {
        return response.artists;
    }

    if (
        Array.isArray(response?.data)
    ) {
        return response.data;
    }

    if (
        Array.isArray(response?.data?.artists)
    ) {
        return response.data.artists;
    }

    return [];
}


function formatDuration(value) {
    const totalSeconds =
        Number(value) || 0;

    if (
        totalSeconds <= 0
    ) {
        return '—';
    }

    const minutes =
        Math.floor(
            totalSeconds / 60
        );

    const seconds =
        Math.floor(
            totalSeconds % 60
        );

    return `${minutes}:${String(
        seconds
    ).padStart(2, '0')}`;
}


/* =========================================================
   COMPONENT
========================================================= */

function ArtistDetail({
    tracks = [],
    token,
    activeTrack,
    isPlaying,
    onSelectTrack,
    onTogglePlayback,
}) {
    const {
        artistKey,
    } = useParams();

    const navigate = useNavigate();


    /* =====================================================
       DATABASE ARTIST
    ===================================================== */

    const [
        artistRecord,
        setArtistRecord,
    ] = useState(null);

    const [
        artistRecordLoading,
        setArtistRecordLoading,
    ] = useState(true);


    /*
     * Load the actual Artist record from:
     *
     * GET /api/artists
     *
     * This is important because artist image and
     * description belong to Artist, not Track.
     */
    useEffect(() => {
        let cancelled = false;

        async function loadArtistRecord() {
            if (
                !token ||
                !artistKey
            ) {
                setArtistRecord(null);
                setArtistRecordLoading(false);
                return;
            }

            setArtistRecordLoading(true);

            try {
                const requestedName =
                    decodeURIComponent(
                        artistKey || ''
                    ).trim();

                const response =
                    await publicArtistsApi.list(
                        token,
                        requestedName
                    );

                const apiArtists =
                    extractArtistsFromResponse(
                        response
                    );

                const requestedNormalized =
                    normalizeArtistName(
                        requestedName
                    );

                let found =
                    apiArtists.find(
                        (item) => {
                            const itemName =
                                typeof item?.name === 'string'
                                    ? item.name
                                    : '';

                            const itemNormalized =
                                typeof item?.normalizedName === 'string'
                                    ? item.normalizedName
                                    : normalizeArtistName(
                                        itemName
                                    );

                            return (
                                itemNormalized ===
                                requestedNormalized
                            );
                        }
                    );

                /*
                 * If the API search returned only a
                 * partial result, try matching by name.
                 */
                if (!found) {
                    found =
                        apiArtists.find(
                            (item) => {
                                return (
                                    normalizeArtistName(
                                        item?.name || ''
                                    ) ===
                                    requestedNormalized
                                );
                            }
                        );
                }

                if (!cancelled) {
                    setArtistRecord(
                        found || null
                    );
                }
            } catch (error) {
                console.error(
                    'Failed to load artist:',
                    error
                );

                if (!cancelled) {
                    setArtistRecord(null);
                }
            } finally {
                if (!cancelled) {
                    setArtistRecordLoading(false);
                }
            }
        }

        loadArtistRecord();

        return () => {
            cancelled = true;
        };
    }, [
        token,
        artistKey,
    ]);


    /* =====================================================
       STICKY HEADER / CONTENT SCROLL
    ===================================================== */

    const [
        showStickyHeader,
        setShowStickyHeader,
    ] = useState(false);

    const [
        popularVisibleCount,
        setPopularVisibleCount,
    ] = useState(5);

    const heroRef = useRef(null);


    useEffect(() => {
        const hero =
            heroRef.current;

        const scrollContainer =
            document.querySelector(
                '.content'
            );

        if (
            !hero ||
            !scrollContainer
        ) {
            return;
        }

        let lastScrollTop =
            scrollContainer.scrollTop;

        function handleScroll() {
            const currentScrollTop =
                scrollContainer.scrollTop;

            const scrollingDown =
                currentScrollTop >
                lastScrollTop;

            const containerRect =
                scrollContainer.getBoundingClientRect();

            const heroRect =
                hero.getBoundingClientRect();

            const heroHasLeftViewport =
                heroRect.bottom <=
                containerRect.top;

            if (
                scrollingDown &&
                heroHasLeftViewport
            ) {
                setShowStickyHeader(true);
            }

            if (!scrollingDown) {
                setShowStickyHeader(false);
            }

            if (
                currentScrollTop <= 5
            ) {
                setShowStickyHeader(false);
            }

            lastScrollTop =
                currentScrollTop;
        }

        setShowStickyHeader(false);

        scrollContainer.addEventListener(
            'scroll',
            handleScroll,
            {
                passive: true,
            }
        );

        return () => {
            scrollContainer.removeEventListener(
                'scroll',
                handleScroll
            );
        };
    }, []);


    /* =====================================================
       BUILD INDIVIDUAL ARTIST GROUPS
    ===================================================== */

    const artists = useMemo(() => {
        const grouped =
            new Map();

        const addArtistTrack = (
            artistData,
            track,
        ) => {
            const name =
                typeof artistData?.name === 'string'
                    ? artistData.name.trim()
                    : '';

            if (!name) {
                return;
            }

            const key =
                typeof artistData?.normalizedName === 'string' &&
                artistData.normalizedName.trim()
                    ? artistData.normalizedName.trim()
                    : normalizeArtistName(
                        name
                    );

            if (!grouped.has(key)) {
                grouped.set(
                    key,
                    {
                        key,
                        name,

                        cover:
                            typeof artistData?.coverUrl === 'string'
                                ? artistData.coverUrl
                                : '',

                        tracks: [],
                    }
                );
            }

            const item =
                grouped.get(key);

            /*
             * Keep an image if the relationship
             * contains one.
             */
            if (
                !item.cover &&
                typeof artistData?.coverUrl === 'string' &&
                artistData.coverUrl
            ) {
                item.cover =
                    artistData.coverUrl;
            }

            if (
                track?.id &&
                !item.tracks.some(
                    (existingTrack) =>
                        existingTrack?.id ===
                        track.id
                )
            ) {
                item.tracks.push(
                    track
                );
            }
        };


        tracks.forEach((track) => {
            const relationships =
                Array.isArray(
                    track?.artists
                )
                    ? track.artists
                    : [];

            const individualArtists =
                relationships
                    .map(
                        (relationship) =>
                            relationship?.artist
                    )
                    .filter(
                        (artist) =>
                            artist &&
                            typeof artist.name ===
                                'string' &&
                            artist.name.trim()
                    );

            if (
                individualArtists.length >
                0
            ) {
                individualArtists.forEach(
                    (artistData) => {
                        addArtistTrack(
                            artistData,
                            track
                        );
                    }
                );

                return;
            }


            /*
             * Backward compatibility for old
             * API responses.
             */
            const legacyArtist =
                typeof track?.artist === 'string'
                    ? track.artist.trim()
                    : '';

            const legacyNames =
                legacyArtist
                    ? legacyArtist
                        .split(',')
                        .map(
                            (name) =>
                                name.trim()
                        )
                        .filter(Boolean)
                    : [];

            if (
                legacyNames.length ===
                0
            ) {
                addArtistTrack(
                    {
                        name:
                            'Unknown Artist',

                        normalizedName:
                            'unknown artist',
                    },
                    track
                );

                return;
            }

            legacyNames.forEach(
                (name) => {
                    addArtistTrack(
                        {
                            name,

                            normalizedName:
                                normalizeArtistName(
                                    name
                                ),
                        },
                        track
                    );
                }
            );
        });


        return [
            ...grouped.values(),
        ]
            .map((item) => {
                const albums = [
                    ...new Set(
                        item.tracks
                            .map(
                                (track) =>
                                    typeof track?.album ===
                                    'string'
                                        ? track.album.trim()
                                        : ''
                            )
                            .filter(Boolean)
                    ),
                ];

                return {
                    ...item,

                    songCount:
                        item.tracks.length,

                    albumCount:
                        albums.length,
                };
            })
            .sort(
                (a, b) =>
                    a.name.localeCompare(
                        b.name,
                        undefined,
                        {
                            sensitivity:
                                'base',
                        }
                    )
            );
    }, [tracks]);


    /* =====================================================
       FIND TRACK-BASED ARTIST
    ===================================================== */

    const trackArtist =
        useMemo(
            () => {
                const normalizedKey =
                    normalizeArtistName(
                        decodeURIComponent(
                            artistKey || ''
                        )
                    );

                return artists.find(
                    (item) =>
                        item.key ===
                        normalizedKey
                );
            },
            [
                artists,
                artistKey,
            ]
        );


    /* =====================================================
       MERGE DATABASE ARTIST + TRACK ARTIST
    ===================================================== */

    const artist =
        useMemo(() => {
            const normalizedKey =
                normalizeArtistName(
                    decodeURIComponent(
                        artistKey || ''
                    )
                );

            /*
             * If both sources exist, database Artist
             * data takes priority for:
             *
             * - name
             * - normalizedName
             * - image
             * - description
             */
            if (
                !trackArtist &&
                !artistRecord
            ) {
                return null;
            }

            const databaseCover =
                normalizeArtistCoverUrl(
                    artistRecord?.coverUrl
                );

            const trackCover =
                normalizeArtistCoverUrl(
                    trackArtist?.cover
                );

            return {
                ...(trackArtist || {}),

                id:
                    artistRecord?.id ||
                    trackArtist?.id ||
                    null,

                name:
                    artistRecord?.name ||
                    trackArtist?.name ||
                    decodeURIComponent(
                        artistKey || ''
                    ),

                normalizedName:
                    artistRecord?.normalizedName ||
                    trackArtist?.key ||
                    normalizedKey,

                /*
                 * IMPORTANT:
                 *
                 * Database Artist image wins.
                 */
                cover:
                    databaseCover ||
                    trackCover ||
                    '',

                description:
                    typeof artistRecord?.description ===
                    'string'
                        ? artistRecord.description
                        : '',

                tracks:
                    trackArtist?.tracks ||
                    [],

                songCount:
                    trackArtist?.songCount ||
                    0,

                albumCount:
                    trackArtist?.albumCount ||
                    0,
            };
        }, [
            artists,
            artistRecord,
            trackArtist,
            artistKey,
        ]);


    /* =====================================================
       ARTIST TRACKS
    ===================================================== */

    const artistTracks =
        useMemo(() => {
            if (!artist) {
                return [];
            }

            return [
                ...artist.tracks,
            ].sort(
                (a, b) => {
                    const playA =
                        Number(
                            a?.playCount
                        ) || 0;

                    const playB =
                        Number(
                            b?.playCount
                        ) || 0;

                    if (
                        playB !== playA
                    ) {
                        return (
                            playB - playA
                        );
                    }

                    return String(
                        a?.title || ''
                    ).localeCompare(
                        String(
                            b?.title || ''
                        ),
                        undefined,
                        {
                            sensitivity:
                                'base',
                        }
                    );
                }
            );
        }, [artist]);


    /* =====================================================
       POPULAR SONGS
    ===================================================== */

    const popularTracks =
        useMemo(
            () =>
                artistTracks.slice(
                    0,
                    popularVisibleCount
                ),
            [
                artistTracks,
                popularVisibleCount,
            ]
        );


    const hasMorePopularTracks =
        popularVisibleCount <
        artistTracks.length;


    function showMorePopularTracks() {
        setPopularVisibleCount(
            (current) =>
                Math.min(
                    current + 5,
                    artistTracks.length
                )
        );
    }


    useEffect(() => {
        setPopularVisibleCount(5);
    }, [artistKey]);


    /* =====================================================
       ALBUMS
    ===================================================== */

    const albums =
        useMemo(() => {
            const grouped =
                new Map();

            artistTracks.forEach(
                (track) => {
                    const albumName =
                        typeof track?.album ===
                        'string'
                            ? track.album.trim()
                            : '';

                    if (!albumName) {
                        return;
                    }

                    const key =
                        albumName
                            .normalize(
                                'NFKC'
                            )
                            .toLocaleLowerCase();

                    if (
                        !grouped.has(key)
                    ) {
                        grouped.set(
                            key,
                            []
                        );
                    }

                    grouped
                        .get(key)
                        .push(track);
                }
            );


            return [
                ...grouped.entries(),
            ]
                .map(
                    ([
                        key,
                        albumTracks,
                    ]) => {
                        const first =
                            albumTracks[0];

                        return {
                            key,

                            name:
                                first?.album ||
                                'Unknown Album',

                            year:
                                first?.releaseYear ||
                                '',

                            cover:
                                albumTracks.find(
                                    (track) =>
                                        track?.thumbnailUrl
                                )?.thumbnailUrl ||
                                '',

                            tracks:
                                albumTracks,
                        };
                    }
                )
                .sort(
                    (a, b) => {
                        const yearA =
                            Number(
                                a.year
                            ) || 0;

                        const yearB =
                            Number(
                                b.year
                            ) || 0;

                        if (
                            yearB !==
                            yearA
                        ) {
                            return (
                                yearB -
                                yearA
                            );
                        }

                        return a.name.localeCompare(
                            b.name
                        );
                    }
                );
        }, [artistTracks]);


    /* =====================================================
       OTHER ARTISTS
    ===================================================== */

    const relatedArtists =
        useMemo(() => {
            return artists
                .filter(
                    (item) =>
                        item.key !==
                        artist?.key
                )
                .slice(0, 6);
        }, [
            artists,
            artist,
        ]);


    /* =====================================================
       PLAY ARTIST
    ===================================================== */

    function playArtist() {
        if (
            !artistTracks.length
        ) {
            return;
        }

        const firstTrack =
            artistTracks[0];

        onSelectTrack(
            firstTrack.id,
            artistTracks,
            true
        );
    }


    /* =====================================================
       PLAY SONG
    ===================================================== */

    function playSong(track) {
        onSelectTrack(
            track.id,
            artistTracks,
            true
        );
    }


    /* =====================================================
       ACTIVE CHECK
    ===================================================== */

    function isTrackPlaying(
        track
    ) {
        return (
            activeTrack?.id ===
                track?.id &&
            isPlaying
        );
    }


    /* =====================================================
       ARTIST LOADING
    ===================================================== */

    if (
        artistRecordLoading &&
        !artist
    ) {
        return (
            <section className="artist-detail-page">

                <button
                    type="button"
                    className="artist-detail-back"
                    onClick={() =>
                        navigate(
                            '/artists'
                        )
                    }
                >
                    <Icon name="arrow-left" />

                    <span>
                        Artists
                    </span>
                </button>

                <div className="artist-detail-empty">

                    <div
                        className="artist-detail-loading"
                    >
                        Loading artist...
                    </div>

                </div>

            </section>
        );
    }


    /* =====================================================
       ARTIST NOT FOUND
    ===================================================== */

    if (!artist) {
        return (
            <section className="artist-detail-page">

                <button
                    type="button"
                    className="artist-detail-back"
                    onClick={() =>
                        navigate(
                            '/artists'
                        )
                    }
                >
                    <Icon name="arrow-left" />

                    <span>
                        Artists
                    </span>
                </button>

                <div className="artist-detail-empty">

                    <Icon name="user" />

                    <h2>
                        Artist not found
                    </h2>

                    <p>
                        This artist is not
                        available in your
                        music library.
                    </p>

                    <button
                        type="button"
                        onClick={() =>
                            navigate(
                                '/artists'
                            )
                        }
                    >
                        Browse artists
                    </button>

                </div>

            </section>
        );
    }


    /* =====================================================
       ARTIST PLAYING STATE
    ===================================================== */

    const artistIsPlaying =
        artistTracks.some(
            (track) =>
                track.id ===
                    activeTrack?.id &&
                isPlaying
        );


    /* =====================================================
       RENDER
    ===================================================== */

    return (
        <section className="artist-detail-page">

            {/* =================================================
                BACK
            ================================================= */}

            <button
                type="button"
                className="artist-detail-back"
                onClick={() =>
                    navigate(
                        '/artists'
                    )
                }
            >
                <Icon name="arrow-left" />

                <span>
                    Artists
                </span>
            </button>


            {/* =================================================
                HERO
            ================================================= */}

            <section
                ref={heroRef}
                className="artist-detail-hero"
            >

                <div className="artist-detail-hero-image">

                    {artist.cover ? (
                        <CoverImage
                            src={
                                artist.cover
                            }
                            token={
                                token
                            }
                        />
                    ) : (
                        <div className="artist-detail-placeholder">
                            <Icon name="user" />
                        </div>
                    )}

                </div>

                <div className="artist-detail-hero-overlay" />

                <div className="artist-detail-hero-content">

                    <span className="artist-detail-verified">
                        Artist
                    </span>

                    <h1>
                        {artist.name}
                    </h1>

                    <p>
                        {artist.songCount}{' '}

                        {artist.songCount ===
                        1
                            ? 'song'
                            : 'songs'}

                        {' · '}

                        {artist.albumCount}{' '}

                        {artist.albumCount ===
                        1
                            ? 'album'
                            : 'albums'}
                    </p>

                </div>

            </section>


            {/* =================================================
                STICKY ARTIST HEADER
            ================================================= */}

            {typeof document !==
                'undefined' &&
                createPortal(
                    <div
                        className={`artist-sticky-header ${
                            showStickyHeader
                                ? 'artist-sticky-header-visible'
                                : ''
                        }`}
                    >

                        <button
                            type="button"
                            className="artist-sticky-play"
                            onClick={
                                artistIsPlaying
                                    ? onTogglePlayback
                                    : playArtist
                            }
                            aria-label={
                                artistIsPlaying
                                    ? `Pause ${artist.name}`
                                    : `Play ${artist.name}`
                            }
                        >
                            <Icon
                                name={
                                    artistIsPlaying
                                        ? 'pause'
                                        : 'play'
                                }
                            />
                        </button>

                        <strong
                            title={
                                artist.name
                            }
                        >
                            {artist.name}
                        </strong>

                    </div>,
                    document.body
                )}


            {/* =================================================
                ACTION BAR
            ================================================= */}

            <div className="artist-detail-actions">

                <button
                    type="button"
                    className="artist-detail-main-play"
                    onClick={
                        artistIsPlaying
                            ? onTogglePlayback
                            : playArtist
                    }
                    aria-label={
                        artistIsPlaying
                            ? `Pause ${artist.name}`
                            : `Play ${artist.name}`
                    }
                >
                    <Icon
                        name={
                            artistIsPlaying
                                ? 'pause'
                                : 'play'
                        }
                    />
                </button>


                <button
                    type="button"
                    className="artist-detail-follow"
                >
                    Follow
                </button>


                <button
                    type="button"
                    className="artist-detail-more"
                    aria-label="More artist options"
                >
                    <Icon name="more-horizontal" />
                </button>

            </div>


            {/* =================================================
                POPULAR
            ================================================= */}

            <section className="artist-section">

                <div className="artist-section-header">

                    <h2>
                        Popular
                    </h2>

                </div>


                <div className="artist-popular-list">

                    {popularTracks.map(
                        (
                            track,
                            index
                        ) => {

                            const playing =
                                isTrackPlaying(
                                    track
                                );

                            return (
                                <button
                                    type="button"
                                    className={`artist-song-row ${
                                        playing
                                            ? 'artist-song-row-active'
                                            : ''
                                    }`}
                                    key={
                                        track.id
                                    }
                                    onClick={() =>
                                        playSong(
                                            track
                                        )
                                    }
                                >

                                    <span className="artist-song-number">

                                        {playing ? (
                                            <Icon
                                                name="volume"
                                            />
                                        ) : (
                                            index + 1
                                        )}

                                    </span>


                                    <div className="artist-song-cover">

                                        <CoverImage
                                            src={
                                                track.thumbnailUrl
                                            }
                                            token={
                                                token
                                            }
                                        />

                                    </div>


                                    <div className="artist-song-info">

                                        <strong>
                                            {track.title ||
                                                'Unknown title'}
                                        </strong>

                                        {track.album ? (
                                            <span>
                                                {
                                                    track.album
                                                }
                                            </span>
                                        ) : null}

                                    </div>


                                    <span className="artist-song-year">
                                        {track.releaseYear ||
                                            '—'}
                                    </span>


                                    <span className="artist-song-duration">
                                        {track.duration
                                            ? formatDuration(
                                                track.duration
                                            )
                                            : '—'}
                                    </span>

                                </button>
                            );
                        }
                    )}

                </div>


                {hasMorePopularTracks ? (
                    <button
                        type="button"
                        className="artist-see-more"
                        onClick={
                            showMorePopularTracks
                        }
                    >
                        See more
                    </button>
                ) : null}

            </section>


            {/* =================================================
                ARTIST PICK
            ================================================= */}

            {albums.length >
            0 ? (
                <section className="artist-section artist-pick-section">

                    <div className="artist-section-header">

                        <h2>
                            Artist pick
                        </h2>

                    </div>


                    <button
                        type="button"
                        className="artist-pick-card"
                        onClick={() => {

                            const first =
                                albums[0]
                                    ?.tracks?.[0];

                            if (first) {
                                playSong(
                                    first
                                );
                            }

                        }}
                    >

                        <div className="artist-pick-cover">

                            <CoverImage
                                src={
                                    albums[0].cover
                                }
                                token={
                                    token
                                }
                            />

                        </div>


                        <div className="artist-pick-info">

                            <span>
                                {artist.name}
                            </span>

                            <strong>
                                {albums[0].name}
                            </strong>

                            <small>
                                {albums[0].year
                                    ? `${albums[0].year} · `
                                    : ''}

                                Album
                            </small>

                        </div>

                    </button>

                </section>
            ) : null}


            {/* =================================================
                DISCOGRAPHY
            ================================================= */}

            <section className="artist-section">

                <div className="artist-section-header">

                    <h2>
                        Discography
                    </h2>

                    {albums.length >
                    5 ? (
                        <button
                            type="button"
                            className="artist-show-all"
                        >
                            Show all
                        </button>
                    ) : null}

                </div>


                {albums.length >
                0 ? (
                    <div className="artist-albums-row">

                        {albums
                            .slice(
                                0,
                                5
                            )
                            .map(
                                (
                                    album
                                ) => (
                                    <button
                                        type="button"
                                        className="artist-album-card"
                                        key={
                                            album.key
                                        }
                                        onClick={() => {

                                            navigate(
                                                `/albums/${encodeURIComponent(
                                                    album.key
                                                )}`
                                            );

                                        }}
                                    >

                                        <div className="artist-album-cover">

                                            <CoverImage
                                                src={
                                                    album.cover
                                                }
                                                token={
                                                    token
                                                }
                                            />

                                        </div>


                                        <strong
                                            title={
                                                album.name
                                            }
                                        >
                                            {
                                                album.name
                                            }
                                        </strong>


                                        <span>
                                            {album.year
                                                ? `${album.year} · `
                                                : ''}

                                            Album
                                        </span>

                                    </button>
                                )
                            )}

                    </div>
                ) : (
                    <p className="artist-no-content">
                        No albums available.
                    </p>
                )}

            </section>


            {/* =================================================
                ABOUT
            ================================================= */}

            <section className="artist-section">

                <div className="artist-section-header">

                    <h2>
                        About
                    </h2>

                </div>


                <div className="artist-about">

                    <div className="artist-about-image">

                        {artist.cover ? (
                            <CoverImage
                                src={
                                    artist.cover
                                }
                                token={
                                    token
                                }
                            />
                        ) : (
                            <div className="artist-detail-placeholder">
                                <Icon name="user" />
                            </div>
                        )}

                    </div>


                    <div className="artist-about-content">

                        <strong>
                            {artist.name}
                        </strong>


                        {artist.description ? (
                            <p>
                                {artist.description}
                            </p>
                        ) : (
                            <p>
                                {artist.songCount}{' '}

                                {artist.songCount ===
                                1
                                    ? 'song'
                                    : 'songs'}

                                {' '}in your
                                library

                                {artist.albumCount >
                                0
                                    ? ` across ${
                                        artist.albumCount
                                    } ${
                                        artist.albumCount ===
                                        1
                                            ? 'album'
                                            : 'albums'
                                    }.`
                                    : '.'}
                            </p>
                        )}

                    </div>

                </div>

            </section>


            {/* =================================================
                FANS ALSO LIKE
            ================================================= */}

            {relatedArtists.length >
            0 ? (
                <section className="artist-section">

                    <div className="artist-section-header">

                        <h2>
                            Fans also like
                        </h2>

                        <button
                            type="button"
                            className="artist-show-all"
                            onClick={() =>
                                navigate(
                                    '/artists'
                                )
                            }
                        >
                            Show all
                        </button>

                    </div>


                    <div className="artist-related-row">

                        {relatedArtists.map(
                            (
                                related
                            ) => {

                                const relatedCover =
                                    normalizeArtistCoverUrl(
                                        related.cover
                                    );

                                return (
                                    <button
                                        type="button"
                                        className="artist-related-card"
                                        key={
                                            related.key
                                        }
                                        onClick={() =>
                                            navigate(
                                                `/artists/${encodeURIComponent(
                                                    related.key
                                                )}`
                                            )
                                        }
                                    >

                                        <div className="artist-related-image">

                                            {relatedCover ? (
                                                <CoverImage
                                                    src={
                                                        relatedCover
                                                    }
                                                    token={
                                                        token
                                                    }
                                                />
                                            ) : (
                                                <Icon name="user" />
                                            )}


                                            <span
                                                className="artist-related-play"
                                                aria-hidden="true"
                                            >
                                                <Icon name="play" />
                                            </span>

                                        </div>


                                        <strong
                                            className="artist-related-name"
                                            title={
                                                related.name
                                            }
                                        >
                                            {
                                                related.name
                                            }
                                        </strong>

                                    </button>
                                );
                            }
                        )}

                    </div>

                </section>
            ) : null}

        </section>
    );
}


export default ArtistDetail;