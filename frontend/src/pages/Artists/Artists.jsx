// src/pages/Artists/Artists.jsx

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import { useNavigate } from 'react-router-dom';

import Icon from '../../components/Icons';
import CoverImage from '../../components/CoverImage';
import PageHeader from '../../components/PageHeader';

import publicArtistsApi from '../../api/publicArtistsApi.js';

import './Artists.css';

const ARTISTS_PER_LOAD = 20;

/*
|--------------------------------------------------------------------------
| NORMALIZE ARTIST NAME
|--------------------------------------------------------------------------
*/

function normalizeArtistName(value) {
    return String(value || '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase();
}

/*
|--------------------------------------------------------------------------
| NORMALIZE COVER URL
|--------------------------------------------------------------------------
|
| Normally the backend should return:
|
| http://localhost:3000/uploads/artists/image.jpeg
|
| This also defensively handles the accidental Markdown format:
|
| [http://localhost:3000/image.jpeg](http://localhost:3000/image.jpeg)
|
|--------------------------------------------------------------------------
*/

function normalizeCoverUrl(value) {
    if (!value) {
        return '';
    }

    const coverUrl = String(value).trim();

    const markdownMatch = coverUrl.match(
        /^\[(.*?)\]\((https?:\/\/.+?)\)$/,
    );

    if (markdownMatch) {
        return markdownMatch[2];
    }

    return coverUrl;
}

/*
|--------------------------------------------------------------------------
| ARTISTS PAGE
|--------------------------------------------------------------------------
*/

function Artists({
    tracks = [],
    token,
}) {
    const navigate = useNavigate();

    /*
    |--------------------------------------------------------------------------
    | SEARCH
    |--------------------------------------------------------------------------
    */

    const [
        query,
        setQuery,
    ] = useState('');

    /*
    |--------------------------------------------------------------------------
    | PAGINATION / LAZY LOADING
    |--------------------------------------------------------------------------
    */

    const [
        visibleCount,
        setVisibleCount,
    ] = useState(
        ARTISTS_PER_LOAD,
    );

    const loadMoreRef =
        useRef(null);

    /*
    |--------------------------------------------------------------------------
    | ARTIST API DATA
    |--------------------------------------------------------------------------
    |
    | This comes from:
    |
    | GET /api/artists
    |
    | NOT:
    |
    | /api/admin/artists
    |
    |--------------------------------------------------------------------------
    */

    const [
        artistRecords,
        setArtistRecords,
    ] = useState([]);

    const [
        artistsLoading,
        setArtistsLoading,
    ] = useState(false);

    const [
        artistsError,
        setArtistsError,
    ] = useState('');

    /*
    |--------------------------------------------------------------------------
    | LOAD ARTISTS
    |--------------------------------------------------------------------------
    */

    useEffect(() => {
        let cancelled = false;

        async function loadArtists() {
            if (!token) {
                return;
            }

            setArtistsLoading(true);
            setArtistsError('');

            try {
                console.log(
                    '[ARTISTS PAGE] Loading public artists...',
                );

                const response =
                    await publicArtistsApi.list(
                        token,
                    );

                console.log(
                    '[ARTISTS PAGE] Public artist response:',
                    response,
                );

                if (cancelled) {
                    return;
                }

                /*
                 * Expected response:
                 *
                 * {
                 *   artists: [...]
                 * }
                 */

                const records =
                    Array.isArray(
                        response?.artists,
                    )
                        ? response.artists
                        : Array.isArray(
                              response,
                          )
                        ? response
                        : [];

                setArtistRecords(
                    records,
                );
            } catch (error) {
                console.error(
                    '[ARTISTS PAGE] Failed to load artists:',
                    error,
                );

                if (!cancelled) {
                    setArtistRecords([]);
                    setArtistsError(
                        error?.message ||
                            'Failed to load artists.',
                    );
                }
            } finally {
                if (!cancelled) {
                    setArtistsLoading(
                        false,
                    );
                }
            }
        }

        loadArtists();

        return () => {
            cancelled = true;
        };
    }, [token]);

    /*
    |--------------------------------------------------------------------------
    | ARTIST LOOKUP MAP
    |--------------------------------------------------------------------------
    |
    | Example:
    |
    | "100rbh"
    |     ↓
    | {
    |   id: "...",
    |   name: "100RBH",
    |   coverUrl: "http://localhost:3000/uploads/..."
    | }
    |
    |--------------------------------------------------------------------------
    */

    const artistMap = useMemo(() => {
        const map =
            new Map();

        artistRecords.forEach(
            (artist) => {
                if (!artist) {
                    return;
                }

                const normalizedName =
                    artist.normalizedName ||
                    normalizeArtistName(
                        artist.name,
                    );

                if (!normalizedName) {
                    return;
                }

                map.set(
                    normalizedName,
                    {
                        ...artist,

                        coverUrl:
                            normalizeCoverUrl(
                                artist.coverUrl,
                            ),
                    },
                );
            },
        );

        return map;
    }, [artistRecords]);

    /*
    |--------------------------------------------------------------------------
    | GROUP TRACKS BY ARTIST
    |--------------------------------------------------------------------------
    |
    | Your current /api/tracks response contains:
    |
    | {
    |   artist: "100RBH"
    | }
    |
    | It does NOT contain:
    |
    | artists[].artist.coverUrl
    |
    | Therefore we use the artist name from tracks and
    | match it against /api/artists.
    |--------------------------------------------------------------------------
    */

    const artists = useMemo(() => {
        const grouped =
            new Map();

        /*
        |--------------------------------------------------------------------------
        | ADD TRACK TO ARTIST
        |--------------------------------------------------------------------------
        */

        const addTrackToArtist = (
            artistData,
            track,
        ) => {
            let name = '';

            /*
             * New relationship format:
             *
             * {
             *   name: "Arijit Singh",
             *   normalizedName: "arijit singh"
             * }
             */

            if (
                typeof artistData ===
                'object'
            ) {
                name =
                    typeof artistData.name ===
                    'string'
                        ? artistData.name.trim()
                        : '';
            }

            /*
             * Legacy format:
             *
             * "Arijit Singh"
             */

            if (
                typeof artistData ===
                'string'
            ) {
                name =
                    artistData.trim();
            }

            if (!name) {
                return;
            }

            const normalizedName =
                typeof artistData ===
                    'object' &&
                typeof artistData.normalizedName ===
                    'string' &&
                artistData.normalizedName.trim()
                    ? artistData.normalizedName.trim()
                    : normalizeArtistName(
                          name,
                      );

            if (!normalizedName) {
                return;
            }

            /*
             * Find artist information from
             * authenticated /api/artists.
             */

            const artistRecord =
                artistMap.get(
                    normalizedName,
                );

            /*
             * Create artist group.
             */

            if (
                !grouped.has(
                    normalizedName,
                )
            ) {
                grouped.set(
                    normalizedName,
                    {
                        key:
                            normalizedName,

                        name,

                        artistId:
                            artistRecord?.id ||
                            null,

                        cover:
                            normalizeCoverUrl(
                                artistRecord?.coverUrl,
                            ),

                        description:
                            artistRecord?.description ||
                            '',

                        tracks: [],
                    },
                );
            }

            const artist =
                grouped.get(
                    normalizedName,
                );

            /*
             * Always prefer the artwork from
             * the Artist table.
             */

            if (
                artistRecord?.coverUrl
            ) {
                artist.cover =
                    normalizeCoverUrl(
                        artistRecord.coverUrl,
                    );
            }

            /*
             * Keep artist ID.
             */

            if (
                artistRecord?.id
            ) {
                artist.artistId =
                    artistRecord.id;
            }

            /*
             * Keep description.
             */

            if (
                artistRecord?.description
            ) {
                artist.description =
                    artistRecord.description;
            }

            /*
             * Prevent duplicate tracks.
             */

            if (
                !artist.tracks.some(
                    (existingTrack) =>
                        existingTrack?.id ===
                        track?.id,
                )
            ) {
                artist.tracks.push(
                    track,
                );
            }
        };

        /*
        |--------------------------------------------------------------------------
        | PROCESS TRACKS
        |--------------------------------------------------------------------------
        */

        tracks.forEach(
            (track) => {
                /*
                 * New API relationship format.
                 *
                 * Keep this for backward compatibility.
                 */

                const relationships =
                    Array.isArray(
                        track?.artists,
                    )
                        ? track.artists
                        : [];

                const individualArtists =
                    relationships
                        .map(
                            (
                                relationship,
                            ) =>
                                relationship?.artist,
                        )
                        .filter(
                            (artist) =>
                                artist &&
                                typeof artist.name ===
                                    'string' &&
                                artist.name.trim(),
                        );

                if (
                    individualArtists.length >
                    0
                ) {
                    individualArtists.forEach(
                        (artist) => {
                            addTrackToArtist(
                                artist,
                                track,
                            );
                        },
                    );

                    return;
                }

                /*
                 * CURRENT API FORMAT
                 *
                 * Example:
                 *
                 * artist:
                 * "Dev Negi, Palak Muchhal, Alka Yagnik"
                 */

                const legacyArtist =
                    typeof track?.artist ===
                    'string'
                        ? track.artist.trim()
                        : '';

                const legacyNames =
                    legacyArtist
                        ? legacyArtist
                              .split(',')
                              .map(
                                  (
                                      artist,
                                  ) =>
                                      artist.trim(),
                              )
                              .filter(
                                  Boolean,
                              )
                        : [];

                /*
                 * Unknown artist.
                 */

                if (
                    legacyNames.length ===
                    0
                ) {
                    addTrackToArtist(
                        'Unknown Artist',
                        track,
                    );

                    return;
                }

                /*
                 * Add each individual artist.
                 */

                legacyNames.forEach(
                    (name) => {
                        addTrackToArtist(
                            name,
                            track,
                        );
                    },
                );
            },
        );

        /*
        |--------------------------------------------------------------------------
        | CALCULATE ALBUM COUNT
        |--------------------------------------------------------------------------
        */

        return [
            ...grouped.values(),
        ]
            .map(
                (artist) => {
                    const albums = [
                        ...new Set(
                            artist.tracks
                                .map(
                                    (
                                        track,
                                    ) =>
                                        typeof track?.album ===
                                            'string'
                                            ? track.album.trim()
                                            : '',
                                )
                                .filter(
                                    Boolean,
                                ),
                        ),
                    ];

                    return {
                        ...artist,

                        albumCount:
                            albums.length,
                    };
                },
            )
            .sort(
                (
                    a,
                    b,
                ) =>
                    a.name.localeCompare(
                        b.name,
                        undefined,
                        {
                            sensitivity:
                                'base',
                        },
                    ),
            );
    }, [
        tracks,
        artistMap,
    ]);

    /*
    |--------------------------------------------------------------------------
    | SEARCH
    |--------------------------------------------------------------------------
    */

    const filteredArtists =
        useMemo(() => {
            const cleanQuery =
                normalizeArtistName(
                    query,
                );

            if (!cleanQuery) {
                return artists;
            }

            return artists.filter(
                (artist) =>
                    normalizeArtistName(
                        `${artist.name} ${artist.tracks
                            .map(
                                (
                                    track,
                                ) =>
                                    track?.album ||
                                    '',
                            )
                            .join(' ')}`,
                    ).includes(
                        cleanQuery,
                    ),
            );
        }, [
            artists,
            query,
        ]);

    /*
    |--------------------------------------------------------------------------
    | VISIBLE ARTISTS
    |--------------------------------------------------------------------------
    */

    const visibleArtists =
        useMemo(
            () =>
                filteredArtists.slice(
                    0,
                    visibleCount,
                ),
            [
                filteredArtists,
                visibleCount,
            ],
        );

    const hasMore =
        visibleCount <
        filteredArtists.length;

    /*
    |--------------------------------------------------------------------------
    | LOAD MORE
    |--------------------------------------------------------------------------
    */

    const loadMore =
        useCallback(() => {
            if (!hasMore) {
                return;
            }

            setVisibleCount(
                (current) =>
                    Math.min(
                        current +
                            ARTISTS_PER_LOAD,
                        filteredArtists.length,
                    ),
            );
        }, [
            hasMore,
            filteredArtists.length,
        ]);

    /*
    |--------------------------------------------------------------------------
    | INTERSECTION OBSERVER
    |--------------------------------------------------------------------------
    */

    useEffect(() => {
        const element =
            loadMoreRef.current;

        if (
            !element ||
            !hasMore
        ) {
            return;
        }

        const observer =
            new IntersectionObserver(
                (entries) => {
                    const entry =
                        entries[0];

                    if (
                        entry?.isIntersecting
                    ) {
                        loadMore();
                    }
                },
                {
                    root: null,
                    rootMargin:
                        '500px',
                    threshold: 0,
                },
            );

        observer.observe(
            element,
        );

        return () => {
            observer.disconnect();
        };
    }, [
        loadMore,
        hasMore,
    ]);

    /*
    |--------------------------------------------------------------------------
    | RESET WHEN SEARCH CHANGES
    |--------------------------------------------------------------------------
    */

    useEffect(() => {
        setVisibleCount(
            ARTISTS_PER_LOAD,
        );
    }, [query]);

    /*
    |--------------------------------------------------------------------------
    | RESET WHEN TRACKS CHANGE
    |--------------------------------------------------------------------------
    */

    useEffect(() => {
        setVisibleCount(
            ARTISTS_PER_LOAD,
        );
    }, [tracks]);

    /*
    |--------------------------------------------------------------------------
    | RESET WHEN ARTIST DATA CHANGES
    |--------------------------------------------------------------------------
    */

    useEffect(() => {
        setVisibleCount(
            ARTISTS_PER_LOAD,
        );
    }, [artistRecords]);

    /*
    |--------------------------------------------------------------------------
    | OPEN ARTIST
    |--------------------------------------------------------------------------
    */

    function openArtist(
        artist,
    ) {
        console.log(
            '[ARTISTS PAGE] Opening artist:',
            artist,
        );

        /*
         * Keep your existing ArtistDetail
         * routing based on normalized artist name.
         */

        navigate(
            `/artists/${encodeURIComponent(
                artist.key,
            )}`,
        );
    }

    /*
    |--------------------------------------------------------------------------
    | UI
    |--------------------------------------------------------------------------
    */

    return (
        <section className="artists-page">

            {/* =================================================
                HEADER
            ================================================= */}

            <PageHeader
                eyebrow="Library"
                title="Artists"
                description="Browse your music collection by artist."
                right={
                    <span className="page-header-count">
                        {artists.length}{' '}
                        {artists.length ===
                        1
                            ? 'artist'
                            : 'artists'}
                    </span>
                }
            />

            {/* =================================================
                SEARCH
            ================================================= */}

            <div className="artists-toolbar">

                <div className="artist-search">

                    <Icon name="search" />

                    <input
                        type="search"
                        value={query}
                        onChange={(
                            event,
                        ) =>
                            setQuery(
                                event.target
                                    .value,
                            )
                        }
                        placeholder="Search artists..."
                        aria-label="Search artists"
                    />

                    {/* {query && (
                        // <button
                        //     type="button"
                        //     className="artist-search-clear"
                        //     onClick={() =>
                        //         setQuery(
                        //             '',
                        //         )
                        //     }
                        //     aria-label="Clear search"
                        // >
                        //     ×
                        // </button>
                    )} */}

                </div>

            </div>

            {/* =================================================
                ERROR
            ================================================= */}

            {artistsError && (
                <div className="artists-error">
                    {artistsError}
                </div>
            )}

            {/* =================================================
                LOADING
            ================================================= */}

            {artistsLoading &&
            artistRecords.length ===
                0 ? (
                <div className="artists-loading">

                    <span className="artists-loader" />

                    <span>
                        Loading artists...
                    </span>

                </div>
            ) : filteredArtists.length ===
              0 ? (
                /*
                =================================================
                EMPTY
                =================================================
                */

                <div className="artists-empty">

                    <Icon name="user" />

                    <h2>
                        No artists found
                    </h2>

                    <p>
                        {query
                            ? 'Try another artist name.'
                            : 'Artists will appear here when your songs have artist metadata.'}
                    </p>

                </div>
            ) : (
                <>
                    {/* =================================================
                        ARTIST GRID
                    ================================================= */}

                    <div className="artists-grid">

                        {visibleArtists.map(
                            (artist) => (
                                <button
                                    type="button"
                                    className="artist-card"
                                    key={
                                        artist.key
                                    }
                                    onClick={() =>
                                        openArtist(
                                            artist,
                                        )
                                    }
                                    aria-label={`Open artist ${artist.name}`}
                                >

                                    {/* =================================
                                        COVER
                                    ================================= */}

                                    <div className="artist-card-cover">

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
                                            <div className="artist-cover-placeholder">
                                                <Icon name="user" />
                                            </div>
                                        )}

                                        {/* PLAY BUTTON */}

                                        <span className="artist-card-play">
                                            <Icon name="play" />
                                        </span>

                                    </div>

                                    {/* =================================
                                        INFO
                                    ================================= */}

                                    <div className="artist-card-info">

                                        <strong
                                            title={
                                                artist.name
                                            }
                                        >
                                            {
                                                artist.name
                                            }
                                        </strong>

                                        <span>
                                            {
                                                artist
                                                    .tracks
                                                    .length
                                            }{' '}
                                            {artist
                                                .tracks
                                                .length ===
                                            1
                                                ? 'song'
                                                : 'songs'}
                                        </span>

                                        {artist.albumCount >
                                        0 ? (
                                            <small>
                                                {
                                                    artist.albumCount
                                                }{' '}
                                                {artist.albumCount ===
                                                1
                                                    ? 'album'
                                                    : 'albums'}
                                            </small>
                                        ) : null}

                                    </div>

                                </button>
                            ),
                        )}

                    </div>

                    {/* =================================================
                        LOAD MORE
                    ================================================= */}

                    {hasMore && (
                        <div
                            ref={
                                loadMoreRef
                            }
                            className="artists-load-more"
                            aria-hidden="true"
                        >

                            <span className="artists-loader" />

                            <span>
                                Loading more artists...
                            </span>

                        </div>
                    )}

                    {/* =================================================
                        END
                    ================================================= */}

                    {!hasMore &&
                    filteredArtists.length >
                        ARTISTS_PER_LOAD ? (
                        <div className="artists-load-end">
                            All{' '}
                            {
                                filteredArtists.length
                            }{' '}
                            artists loaded
                        </div>
                    ) : null}

                </>
            )}

        </section>
    );
}

export default Artists;