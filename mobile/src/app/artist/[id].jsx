import {
    useEffect,
    useMemo,
    useState,
} from 'react';

import {
    Pressable,
    Text,
    View,
} from 'react-native';

import {
    useLocalSearchParams,
    useRouter,
} from 'expo-router';

import AppShell from '../../components/AppShell';
import Cover from '../../components/Cover';
import SectionHeader from '../../components/SectionHeader';
import TrackList from '../../components/TrackList';

import { usePlayer } from '../../context/PlayerContext';
import { useThemeStyles } from '../../context/ThemeContext';
import { artistsApi } from '../../lib/api';
import { useStore } from '../../store/store';
import { colors } from '../../theme/theme';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const ARTIST_IMAGE_SIZE = 180;

/* -------------------------------------------------------------------------- */
/* Normalize artist name                                                      */
/* -------------------------------------------------------------------------- */

function normalizeArtistName(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Normalize cover URL                                                        */
/* -------------------------------------------------------------------------- */

function normalizeCoverUrl(value) {
  if (!value) {
    return '';
  }

  const coverUrl = String(value).trim();

  if (!coverUrl) {
    return '';
  }

  /*
   * Handle accidental markdown:
   *
   * [http://server/image.jpg](http://server/image.jpg)
   */
  const markdownMatch = coverUrl.match(
    /^\[(.*?)\]\((https?:\/\/.+?)\)$/
  );

  if (markdownMatch) {
    return markdownMatch[2];
  }

  return coverUrl;
}

/* -------------------------------------------------------------------------- */
/* Check whether a track belongs to artist                                    */
/* -------------------------------------------------------------------------- */

function trackBelongsToArtist(
  track,
  normalizedArtist
) {
  if (!track || !normalizedArtist) {
    return false;
  }

  /* ------------------------------------------------------------------------ */
  /* New relationship format                                                 */
  /*                                                                        */
  /* track.artists = [                                                       */
  /*   {                                                                     */
  /*     artist: {                                                           */
  /*       name: 'Artist',                                                   */
  /*       normalizedName: 'artist'                                          */
  /*     }                                                                   */
  /*   }                                                                     */
  /* ]                                                                       */
  /* ------------------------------------------------------------------------ */

  if (
    Array.isArray(track.artists) &&
    track.artists.length > 0
  ) {
    const relationshipMatch =
      track.artists.some(
        (relationship) => {
          const artist =
            relationship?.artist;

          if (!artist) {
            return false;
          }

          const relationshipName =
            artist.normalizedName ||
            normalizeArtistName(
              artist.name
            );

          return (
            relationshipName ===
            normalizedArtist
          );
        }
      );

    if (relationshipMatch) {
      return true;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Legacy format                                                            */
  /*                                                                        */
  /* track.artist = "Dev Negi, Palak Muchhal"                               */
  /* ------------------------------------------------------------------------ */

  const artistString =
    typeof track.artist === 'string'
      ? track.artist
      : '';

  if (!artistString) {
    return false;
  }

  return artistString
    .split(',')
    .map((name) =>
      normalizeArtistName(name)
    )
    .filter(Boolean)
    .includes(normalizedArtist);
}

/* -------------------------------------------------------------------------- */
/* Artist Detail                                                              */
/* -------------------------------------------------------------------------- */

export default function ArtistDetail() {
  const styles = useThemeStyles(styleDefinitions);
  const {
    id,
  } = useLocalSearchParams();

  const router = useRouter();

  const token = useStore(
    (s) => s.token
  );

  const allTracks = useStore(
    (s) => s.tracks
  );

  const favorites = useStore(
    (s) => s.favorites
  );

  const toggle = useStore(
    (s) => s.toggleFavorite
  );

  const p = usePlayer();

  const [artist, setArtist] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  /* ------------------------------------------------------------------------ */
  /* Artist name                                                               */
  /* ------------------------------------------------------------------------ */

  const name = useMemo(() => {
    try {
      return decodeURIComponent(
        String(id || '')
      ).trim();
    } catch {
      return String(id || '').trim();
    }
  }, [id]);

  const normalizedName =
    useMemo(
      () =>
        normalizeArtistName(
          name
        ),
      [name]
    );

  /* ------------------------------------------------------------------------ */
  /* Find artist tracks                                                       */
  /* ------------------------------------------------------------------------ */

  const tracks = useMemo(() => {
    if (!normalizedName) {
      return [];
    }

    return allTracks.filter(
      (track) =>
        trackBelongsToArtist(
          track,
          normalizedName
        )
    );
  }, [
    allTracks,
    normalizedName,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Load Artist database record                                              */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    let cancelled = false;

    async function loadArtist() {
      if (!token || !name) {
        setArtist(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        /*
         * The artist API can be addressed using
         * the artist id OR name depending on backend.
         *
         * We first try the supplied route parameter.
         */
        const response =
          await artistsApi.get(
            token,
            name
          );

        const record =
          response?.artist ||
          response ||
          null;

        if (!cancelled) {
          setArtist(record);
        }
      } catch (error) {
        console.warn(
          '[ARTIST DETAIL] Failed to load artist:',
          error?.message || error
        );

        /*
         * Don't create fake artwork from tracks.
         *
         * We can still display the artist
         * using the route name.
         */
        if (!cancelled) {
          setArtist(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadArtist();

    return () => {
      cancelled = true;
    };
  }, [
    token,
    name,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Artist artwork                                                           */
  /* ------------------------------------------------------------------------ */

  const artistCover = useMemo(() => {
    /*
     * IMPORTANT:
     *
     * Only Artist table artwork.
     *
     * NEVER:
     * track.thumbnailUrl
     * album artwork
     */
    return normalizeCoverUrl(
      artist?.coverUrl ||
        artist?.cover
    );
  }, [artist]);

  /* ------------------------------------------------------------------------ */
  /* Artist description                                                       */
  /* ------------------------------------------------------------------------ */

  const description =
    typeof artist?.description ===
    'string'
      ? artist.description
      : '';

  /* ------------------------------------------------------------------------ */
  /* Track count                                                              */
  /* ------------------------------------------------------------------------ */

  const songCount =
    artist?.trackCount ??
    artist?.songCount ??
    tracks.length;

  /* ------------------------------------------------------------------------ */
  /* Albums                                                                   */
  /* ------------------------------------------------------------------------ */

  const albums = useMemo(() => {
    const grouped = new Map();

    tracks.forEach((track) => {
      const album =
        typeof track?.album === 'string'
          ? track.album.trim()
          : '';

      if (!album) {
        return;
      }

      const key =
        album
          .normalize('NFKC')
          .toLocaleLowerCase();

      if (!grouped.has(key)) {
        grouped.set(key, {
          name: album,
          trackCount: 0,
          cover:
            track.thumbnailUrl || '',
        });
      }

      const item =
        grouped.get(key);

      item.trackCount += 1;

      /*
       * Album artwork is allowed here.
       *
       * This is NOT artist artwork.
       */
      if (
        !item.cover &&
        track.thumbnailUrl
      ) {
        item.cover =
          track.thumbnailUrl;
      }
    });

    return [
      ...grouped.values(),
    ];
  }, [tracks]);

  /* ------------------------------------------------------------------------ */
  /* Play artist                                                              */
  /* ------------------------------------------------------------------------ */

  function playArtist() {
    if (!tracks.length) {
      return;
    }

    p.play(
      tracks[0],
      tracks
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Loading                                                                   */
  /* ------------------------------------------------------------------------ */

  if (loading) {
    return (
      <AppShell title="Artist">
        <View style={styles.center}>
          <Text style={styles.loading}>
            Loading artist...
          </Text>
        </View>
      </AppShell>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <AppShell title="Artist">
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                               */}
      {/* ------------------------------------------------------------------ */}

      <View style={styles.hero}>
        <View
          style={[
            styles.artistImageWrapper,
            {
              width:
                ARTIST_IMAGE_SIZE,
              height:
                ARTIST_IMAGE_SIZE,
              borderRadius:
                ARTIST_IMAGE_SIZE / 2,
            },
          ]}
        >
          <Cover
            uri={artistCover}
            token={token}
            size={ARTIST_IMAGE_SIZE}
            r={ARTIST_IMAGE_SIZE / 2}
          />
        </View>

        <Text
          numberOfLines={1}
          style={styles.name}
        >
          {artist?.name || name}
        </Text>

        <Text style={styles.meta}>
          {songCount}{' '}
          {songCount === 1
            ? 'song'
            : 'songs'}
          {' · '}
          {albums.length}{' '}
          {albums.length === 1
            ? 'album'
            : 'albums'}
        </Text>

        <Pressable
          style={styles.play}
          onPress={playArtist}
          disabled={!tracks.length}
        >
          <Text style={styles.playText}>
            ▶  Play artist
          </Text>
        </Pressable>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Popular                                                             */}
      {/* ------------------------------------------------------------------ */}

      <SectionHeader
        title="Popular"
      />

      <TrackList
        tracks={tracks}
        activeTrack={p.activeTrack}
        isPlaying={p.isPlaying}
        token={token}
        onSelect={(track) =>
          p.play(
            track,
            tracks
          )
        }
        onFavorite={toggle}
        favoriteIds={
          new Set(
            favorites.map(
              (track) =>
                String(track.id)
            )
          )
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* About                                                               */}
      {/* ------------------------------------------------------------------ */}

      {description ? (
        <>
          <SectionHeader
            title="About"
          />

          <Text
            style={styles.about}
          >
            {description}
          </Text>
        </>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Albums                                                              */}
      {/* ------------------------------------------------------------------ */}

      <SectionHeader
        title="Albums"
      />

      {albums.length > 0 ? (
        <View style={styles.albums}>
          {albums.map(
            (album) => (
              <Pressable
                key={album.name}
                style={styles.album}
                onPress={() =>
                  router.push(
                    `/albums/${encodeURIComponent(
                      album.name
                    )}`
                  )
                }
              >
                <Cover
                  uri={album.cover}
                  token={token}
                  size={72}
                  r={10}
                />

                <View
                  style={styles.albumInfo}
                >
                  <Text
                    numberOfLines={1}
                    style={styles.albumName}
                  >
                    {album.name}
                  </Text>

                  <Text
                    style={styles.albumMeta}
                  >
                    {album.trackCount}{' '}
                    {album.trackCount ===
                    1
                      ? 'song'
                      : 'songs'}
                  </Text>
                </View>
              </Pressable>
            )
          )}
        </View>
      ) : (
        <Text style={styles.empty}>
          No albums available.
        </Text>
      )}

      <Pressable
        onPress={() =>
          router.push('/albums')
        }
      >
        <Text
          style={styles.link}
        >
          Browse artist discography →
        </Text>
      </Pressable>
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styleDefinitions = {
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
    },

    loading: {
      color: colors.muted,
      fontSize: 14,
    },

    hero: {
      alignItems: 'center',
      paddingTop: 12,
      paddingBottom: 20,
    },

    artistImageWrapper: {
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },

    name: {
      fontSize: 28,
      fontWeight: '900',
      color: colors.text,
      marginTop: 16,
      maxWidth: '90%',
      textAlign: 'center',
    },

    meta: {
      color: colors.muted,
      marginTop: 5,
      textAlign: 'center',
    },

    play: {
      marginTop: 18,
      backgroundColor: colors.accent,
      borderRadius: 999,
      paddingHorizontal: 22,
      paddingVertical: 12,
    },

    playText: {
      color: colors.accentDark,
      fontWeight: '900',
    },

    about: {
      color: colors.muted,
      lineHeight: 21,
      marginBottom: 10,
    },

    albums: {
      gap: 10,
    },

    album: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
    },

    albumInfo: {
      flex: 1,
      marginLeft: 12,
    },

    albumName: {
      color: colors.text,
      fontWeight: '800',
      fontSize: 15,
    },

    albumMeta: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 4,
    },

    empty: {
      color: colors.muted,
      paddingVertical: 10,
    },

    link: {
      color: colors.text,
      fontWeight: '800',
      paddingVertical: 14,
    },
  };